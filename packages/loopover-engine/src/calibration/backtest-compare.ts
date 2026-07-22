// Pareto-floor comparator between two BacktestScoreReports (#8086, part of the #8082 rule-precision
// backtest epic). A proposed rule change may not regress on ANY measured axis even while improving
// another -- "trading one axis for the other" is a regression, not a net win (the scoring METHOD comes
// from SN74's score_pr_delta discipline; nothing is imported or copied from it). backtest-score.ts's
// BacktestScoreReport (#8085) supplies the two axes (precision, recall); this module applies the
// no-regression floor to a baseline-vs-candidate pair of them.
//
// SELF-CONTAINED, PURE: no IO, no randomness, no wall-clock reads -- the same posture as the rest of
// this calibration directory.

import type { BacktestScoreReport } from "./backtest-score.js";

export type BacktestComparison = {
  ruleId: string;
  baseline: BacktestScoreReport;
  candidate: BacktestScoreReport;
  regressedAxes: Array<"precision" | "recall">;
  improvedAxes: Array<"precision" | "recall">;
  verdict: "improved" | "regressed" | "unchanged";
};

/**
 * Compare a candidate rule's backtest score against its baseline, axis by axis. An axis where EITHER
 * report is null is excluded from both lists -- insufficient decided data can't be compared, and null is
 * never treated as 0 or as "no change" (the same unknown-stays-unknown discipline the reports themselves
 * follow). The verdict applies the Pareto floor: a regression on even a single axis makes the whole
 * comparison "regressed", regardless of whether the other axis improved -- never a weighted/averaged
 * trade-off. Throws when the two reports score different rules; that is a caller bug, not a comparison.
 */
export function compareBacktestScores(baseline: BacktestScoreReport, candidate: BacktestScoreReport): BacktestComparison {
  if (baseline.ruleId !== candidate.ruleId) {
    throw new Error(`cannot compare backtest scores for different rules: ${baseline.ruleId} vs ${candidate.ruleId}`);
  }
  const regressedAxes: Array<"precision" | "recall"> = [];
  const improvedAxes: Array<"precision" | "recall"> = [];
  for (const axis of ["precision", "recall"] as const) {
    const baselineValue = baseline[axis];
    const candidateValue = candidate[axis];
    if (baselineValue === null || candidateValue === null) continue;
    if (candidateValue < baselineValue) regressedAxes.push(axis);
    else if (candidateValue > baselineValue) improvedAxes.push(axis);
  }
  return {
    ruleId: baseline.ruleId,
    baseline,
    candidate,
    regressedAxes,
    improvedAxes,
    verdict: regressedAxes.length > 0 ? "regressed" : improvedAxes.length > 0 ? "improved" : "unchanged",
  };
}
