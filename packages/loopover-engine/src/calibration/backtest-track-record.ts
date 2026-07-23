// REGRESSED-verdict track-record aggregation (#8140, part of the #8082 rule-precision backtest epic).
// #8105's Phase-2 merge-gating decision explicitly requires real production data: how often a REGRESSED
// verdict fired, whether it was ever wrong, how often it was right. #8138 persists each CI run's
// BacktestComparison result durably; this module turns that history into the summary a maintainer actually
// decides from -- one total plus a per-rule breakdown -- instead of reading individual PR comments one at
// a time.
//
// SELF-CONTAINED, PURE: array in, summary out -- no IO, no clock, the same posture as the rest of this
// calibration directory. The thin CLI wrapper owns the persisted-row read; this function is fully testable
// against synthetic fixtures before any real production data exists.

import type { BacktestComparison } from "./backtest-compare.js";

/** Per-rule verdict counts: how many comparisons ran for the rule and how each one concluded. */
export type RuleVerdictCounts = {
  total: number;
  regressed: number;
  improved: number;
  unchanged: number;
};

/** The #8105 decision summary: total runs, the REGRESSED count/rate across them, and the same counts
 *  broken down per ruleId. `regressedRate` is null (never coerced to 0) when there are no runs at all --
 *  the same unknown-stays-unknown discipline the score reports themselves follow. */
export type RegressedVerdictTrackRecord = {
  totalRuns: number;
  regressedRuns: number;
  /** regressedRuns / totalRuns, or null when totalRuns === 0. */
  regressedRate: number | null;
  perRule: Map<string, RuleVerdictCounts>;
};

/**
 * Aggregate historical {@link BacktestComparison} results into the track-record summary #8105's
 * merge-gating decision needs. Pure counting -- every comparison contributes to the overall totals and to
 * its own ruleId's bucket; no windowing or weighting here (a caller bounds the input itself, matching how
 * the calibration modules leave storage/scoping to the host).
 */
export function computeRegressedVerdictTrackRecord(comparisons: readonly BacktestComparison[]): RegressedVerdictTrackRecord {
  const perRule = new Map<string, RuleVerdictCounts>();
  let regressedRuns = 0;
  for (const comparison of comparisons) {
    const bucket = perRule.get(comparison.ruleId) ?? { total: 0, regressed: 0, improved: 0, unchanged: 0 };
    bucket.total += 1;
    if (comparison.verdict === "regressed") {
      bucket.regressed += 1;
      regressedRuns += 1;
    } else if (comparison.verdict === "improved") {
      bucket.improved += 1;
    } else {
      bucket.unchanged += 1;
    }
    perRule.set(comparison.ruleId, bucket);
  }
  return {
    totalRuns: comparisons.length,
    regressedRuns,
    regressedRate: comparisons.length > 0 ? regressedRuns / comparisons.length : null,
    perRule,
  };
}
