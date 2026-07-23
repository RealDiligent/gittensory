import { describe, expect, it } from "vitest";

// Import the engine SOURCE directly (not the built dist) -- coverage.include lists
// packages/loopover-engine/src/**, so only a source-path import exercises the .ts these branches live in
// (the dist-importing twin in packages/loopover-engine/test/ covers the built barrel for the workspace
// suite). Same pattern as backtest-threshold-engine.test.ts.
import type { BacktestCase } from "../../packages/loopover-engine/src/calibration/backtest-corpus";
import {
  computeReliabilityCurve,
  deriveThresholdSuggestion,
  RELIABILITY_SAMPLE_FLOOR,
  type ReliabilityBucket,
} from "../../packages/loopover-engine/src/calibration/reliability-curve";

function corpusCase(targetKey: string, label: BacktestCase["label"], confidence?: number): BacktestCase {
  return {
    ruleId: "linked_issue_scope_mismatch",
    targetKey,
    outcome: "unaddressed",
    label,
    firedAt: "2026-07-22T00:00:00.000Z",
    decidedAt: "2026-07-22T01:00:00.000Z",
    ...(confidence !== undefined ? { metadata: { confidence } } : {}),
  };
}

/** `count` decided cases at one claimed confidence, `confirmed` of them upheld. */
function batch(confidence: number, count: number, confirmed: number): BacktestCase[] {
  return Array.from({ length: count }, (_, i) =>
    corpusCase(`t${confidence}#${i}`, i < confirmed ? "confirmed" : "reversed", confidence),
  );
}

describe("computeReliabilityCurve (#8226)", () => {
  it("rejects a non-positive or non-integer bucket count", () => {
    expect(() => computeReliabilityCurve([], 0)).toThrow(RangeError);
    expect(() => computeReliabilityCurve([], 2.5)).toThrow(RangeError);
  });

  it("builds equal-width buckets and counts confirmed/reversed per bucket with real precision at the sample floor", () => {
    const cases = [...batch(0.1, RELIABILITY_SAMPLE_FLOOR, 4), ...batch(0.9, RELIABILITY_SAMPLE_FLOOR, 9)];
    const curve = computeReliabilityCurve(cases, 2);
    expect(curve).toHaveLength(2);
    expect(curve[0]).toEqual({
      lowerBound: 0,
      upperBound: 0.5,
      cases: RELIABILITY_SAMPLE_FLOOR,
      confirmed: 4,
      reversed: RELIABILITY_SAMPLE_FLOOR - 4,
      precision: 4 / RELIABILITY_SAMPLE_FLOOR,
    });
    expect(curve[1]).toEqual({
      lowerBound: 0.5,
      upperBound: 1,
      cases: RELIABILITY_SAMPLE_FLOOR,
      confirmed: 9,
      reversed: RELIABILITY_SAMPLE_FLOOR - 9,
      precision: 9 / RELIABILITY_SAMPLE_FLOOR,
    });
  });

  it("reports null precision (never 0) for an empty bucket and for a bucket below the sample floor", () => {
    const curve = computeReliabilityCurve(batch(0.9, RELIABILITY_SAMPLE_FLOOR - 1, 0), 2);
    // Empty low bucket: null, not 0.
    expect(curve[0]).toMatchObject({ cases: 0, precision: null });
    // Below-floor high bucket with zero confirmations: still null, never coerced to 0.
    expect(curve[1]).toMatchObject({ cases: RELIABILITY_SAMPLE_FLOOR - 1, confirmed: 0, precision: null });
  });

  it("places a boundary claim in the upper bucket, keeps exactly-1 in the last bucket, and degrades a missing confidence to 1", () => {
    const cases = [
      corpusCase("edge#1", "confirmed", 0.5), // exactly on an interior edge -> upper bucket
      corpusCase("full#1", "confirmed", 1), // exactly 1 -> last bucket, not out of range
      corpusCase("none#1", "reversed"), // no metadata.confidence -> degrades to 1
      { ...corpusCase("nan#1", "reversed"), metadata: { confidence: "high" } }, // non-numeric -> degrades to 1
    ];
    const curve = computeReliabilityCurve(cases, 2);
    expect(curve[0]!.cases).toBe(0);
    expect(curve[1]!.cases).toBe(4);
    expect(curve[1]!.confirmed).toBe(2);
    expect(curve[1]!.reversed).toBe(2);
  });

  it("clamps out-of-range claimed confidence into [0, 1] instead of dropping the case", () => {
    const curve = computeReliabilityCurve(
      [corpusCase("low#1", "reversed", -0.3), corpusCase("high#1", "confirmed", 1.7)],
      4,
    );
    expect(curve[0]!.cases).toBe(1);
    expect(curve[0]!.reversed).toBe(1);
    expect(curve[3]!.cases).toBe(1);
    expect(curve[3]!.confirmed).toBe(1);
    expect(curve.reduce((sum, bucket) => sum + bucket.cases, 0)).toBe(2);
  });
});

describe("deriveThresholdSuggestion (#8226)", () => {
  // 0.0-0.25: 10 cases 2 confirmed; 0.25-0.5: 10 cases 6 confirmed; 0.5-0.75: 10 cases 9 confirmed;
  // 0.75-1.0: 10 cases 10 confirmed. Pooled-from-edge precisions: 27/40, 25/30, 19/20, 10/10.
  const corpus = [...batch(0.1, 10, 2), ...batch(0.3, 10, 6), ...batch(0.6, 10, 9), ...batch(0.9, 10, 10)];
  const curve = computeReliabilityCurve(corpus, 4);

  it("returns the LOOSEST qualifying floor, not the tightest", () => {
    // Both 0.5 (19/20 = 0.95) and 0.75 (10/10 = 1) meet 0.9 -- the loosest wins.
    expect(deriveThresholdSuggestion(curve, 0.9, 0)).toBe(0.5);
    // A lower target qualifies at a looser edge.
    expect(deriveThresholdSuggestion(curve, 0.8, 0)).toBe(0.25);
  });

  it("never suggests below the hard minimum even when a looser edge qualifies", () => {
    expect(deriveThresholdSuggestion(curve, 0.8, 0.4)).toBe(0.5);
  });

  it("returns null when no bucket's pooled precision meets the target", () => {
    expect(deriveThresholdSuggestion(curve, 1.01, 0)).toBeNull();
  });

  it("returns null when every precision-qualifying candidate rests on insufficient pooled density", () => {
    // Only the last bucket is populated, below the floor -- perfect precision, but an unknown, so null.
    const thin = computeReliabilityCurve(batch(0.9, RELIABILITY_SAMPLE_FLOOR - 1, RELIABILITY_SAMPLE_FLOOR - 1), 4);
    expect(deriveThresholdSuggestion(thin, 0.5, 0)).toBeNull();
  });

  it("returns null for an empty curve", () => {
    expect(deriveThresholdSuggestion([], 0.5, 0)).toBeNull();
  });

  it("monotonicity invariant: raising the target precision never loosens the suggested floor", () => {
    let previous = -Infinity;
    for (const target of [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99, 1, 1.01]) {
      const suggestion = deriveThresholdSuggestion(curve, target, 0);
      const effective = suggestion ?? Infinity; // null = "no floor is good enough", tighter than any number
      expect(effective).toBeGreaterThanOrEqual(previous);
      previous = effective;
    }
  });

  it("is deterministic: the same curve always yields the same suggestion", () => {
    const again: ReliabilityBucket[] = computeReliabilityCurve(corpus, 4);
    expect(deriveThresholdSuggestion(again, 0.9, 0)).toBe(deriveThresholdSuggestion(curve, 0.9, 0));
  });
});
