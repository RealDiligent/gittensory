// Reliability curves (#8226, epic #8211 track E) -- per-rule empirical precision by claimed-confidence
// bucket, computed from the same labeled BacktestCase corpus (#8083) the scorer (#8085) replays. Where
// knob evaluation steps down hand-picked candidate ladders, a reliability curve lets an optimal
// confidence floor FALL OUT of the data instead of being guessed: bucket the decided cases by their
// stored `metadata.confidence`, measure each bucket's empirical precision, and pick the loosest floor
// whose kept (at-or-above) population still meets a target precision.
//
// Same purity contract as the rest of this module family: no IO, no randomness, no wall-clock reads.

import type { BacktestCase } from "./backtest-corpus.js";

/** Minimum decided cases before a bucket (or a pooled at-or-above population) reports a real precision
 *  instead of null -- the same "unknown stays unknown over a tiny sample" discipline as auto-tune.ts's
 *  `AUTOTUNE_MIN_DECIDED` (10), reused at the same value so backtest-derived suggestions never claim
 *  confidence from a thinner sample than the live auto-tuner itself would accept. */
export const RELIABILITY_SAMPLE_FLOOR = 10;

/** One claimed-confidence bucket of a reliability curve. `lowerBound` is inclusive; `upperBound` is
 *  exclusive except for the final bucket, which also includes 1 (so a full-confidence case is always
 *  counted). `precision` is confirmed / cases -- the fraction of the bucket's firings a human upheld --
 *  and stays null below {@link RELIABILITY_SAMPLE_FLOOR}, never coerced to 0 (the #8085 scorer's own
 *  N/A-over-zero rule). */
export type ReliabilityBucket = {
  lowerBound: number;
  upperBound: number;
  cases: number;
  confirmed: number;
  reversed: number;
  precision: number | null;
};

/**
 * Compute the reliability curve for a labeled corpus: `buckets` equal-width claimed-confidence buckets
 * over [0, 1], each reporting how many decided cases claimed a confidence inside it and how they were
 * humanly decided. Fixed equal-width edges (i/buckets) are a deliberate choice over data-driven
 * quantiles: they are deterministic across corpora, comparable across rules and over time, and cannot
 * silently reshape when the corpus grows -- the property a calibration trend needs most.
 *
 * A case's claimed confidence is read exactly like `buildConfidenceThresholdClassifier` (#8138) reads
 * it: numeric `metadata.confidence`, degrading to 1 when absent/non-numeric (an unscored case is full
 * confidence, never a low-confidence outlier). Out-of-range claims are clamped into [0, 1] so a buggy
 * producer can never make a case vanish from the curve. The caller filters the corpus to one rule
 * first (same contract as `runThresholdBacktest`'s corpus handling) -- this module is pure math over
 * whatever cases it is handed.
 */
export function computeReliabilityCurve(cases: readonly BacktestCase[], buckets: number): ReliabilityBucket[] {
  if (!Number.isInteger(buckets) || buckets < 1) {
    throw new RangeError(`buckets must be a positive integer, got ${buckets}`);
  }
  const curve: ReliabilityBucket[] = [];
  for (let i = 0; i < buckets; i += 1) {
    curve.push({ lowerBound: i / buckets, upperBound: (i + 1) / buckets, cases: 0, confirmed: 0, reversed: 0, precision: null });
  }
  for (const backtestCase of cases) {
    const claimed = typeof backtestCase.metadata?.confidence === "number" ? backtestCase.metadata.confidence : 1;
    const clamped = Math.min(1, Math.max(0, claimed));
    // A claim of exactly 1 lands in the last bucket (its upperBound is inclusive at 1 by convention).
    const index = Math.min(buckets - 1, Math.floor(clamped * buckets));
    const bucket = curve[index]!;
    bucket.cases += 1;
    if (backtestCase.label === "confirmed") bucket.confirmed += 1;
    else bucket.reversed += 1;
  }
  for (const bucket of curve) {
    if (bucket.cases >= RELIABILITY_SAMPLE_FLOOR) bucket.precision = bucket.confirmed / bucket.cases;
  }
  return curve;
}

/**
 * Derive a confidence-floor suggestion from a reliability curve: the LOOSEST bucket lower edge, at or
 * above `hardMinimum`, whose at-or-above buckets' POOLED precision meets `targetPrecision` on a
 * sufficient sample. Pooling (not per-bucket precision) is what a floor actually does at runtime --
 * everything at or above the floor is kept, so the kept population's aggregate precision is the number
 * the target must hold against. Returns null when no candidate edge qualifies, or when every
 * qualifying-precision candidate rests on fewer than {@link RELIABILITY_SAMPLE_FLOOR} pooled decided
 * cases (insufficient density is "unknown", never "good enough") -- deterministic and conservative:
 * ties cannot occur (edges are distinct) and iteration order is fixed, so the same curve always yields
 * the same suggestion.
 */
export function deriveThresholdSuggestion(
  curve: readonly ReliabilityBucket[],
  targetPrecision: number,
  hardMinimum: number,
): number | null {
  for (const candidate of curve) {
    if (candidate.lowerBound < hardMinimum) continue;
    let pooledCases = 0;
    let pooledConfirmed = 0;
    for (const bucket of curve) {
      if (bucket.lowerBound < candidate.lowerBound) continue;
      pooledCases += bucket.cases;
      pooledConfirmed += bucket.confirmed;
    }
    if (pooledCases < RELIABILITY_SAMPLE_FLOOR) continue;
    if (pooledConfirmed / pooledCases >= targetPrecision) return candidate.lowerBound;
  }
  return null;
}
