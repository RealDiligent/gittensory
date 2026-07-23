import { describe, expect, it } from "vitest";
import type { BacktestComparison } from "../../packages/loopover-engine/src/calibration/backtest-compare";
import type { BacktestScoreReport } from "../../packages/loopover-engine/src/calibration/backtest-score";
import { computeRegressedVerdictTrackRecord } from "../../packages/loopover-engine/src/calibration/backtest-track-record";

function report(ruleId: string): BacktestScoreReport {
  return { ruleId, caseCount: 4, truePositive: 1, falsePositive: 1, trueNegative: 1, falseNegative: 1, precision: 0.5, recall: 0.5 };
}

function comparison(ruleId: string, verdict: BacktestComparison["verdict"]): BacktestComparison {
  return {
    ruleId,
    baseline: report(ruleId),
    candidate: report(ruleId),
    regressedAxes: verdict === "regressed" ? ["recall"] : [],
    improvedAxes: verdict === "improved" ? ["precision"] : [],
    verdict,
  };
}

describe("computeRegressedVerdictTrackRecord (#8140)", () => {
  it("summarizes zero runs as null rate (unknown stays unknown, never coerced to 0)", () => {
    const summary = computeRegressedVerdictTrackRecord([]);
    expect(summary.totalRuns).toBe(0);
    expect(summary.regressedRuns).toBe(0);
    expect(summary.regressedRate).toBeNull();
    expect(summary.perRule.size).toBe(0);
  });

  it("summarizes all-clean runs with a real 0 rate — a scored clean streak, not an unknown", () => {
    const summary = computeRegressedVerdictTrackRecord([
      comparison("missing_linked_issue", "improved"),
      comparison("missing_linked_issue", "unchanged"),
    ]);
    expect(summary.totalRuns).toBe(2);
    expect(summary.regressedRuns).toBe(0);
    expect(summary.regressedRate).toBe(0);
    expect(summary.perRule.get("missing_linked_issue")).toEqual({ total: 2, regressed: 0, improved: 1, unchanged: 1 });
  });

  it("counts regressed runs into the overall rate", () => {
    const summary = computeRegressedVerdictTrackRecord([
      comparison("rule_a", "regressed"),
      comparison("rule_a", "improved"),
      comparison("rule_a", "regressed"),
      comparison("rule_a", "unchanged"),
    ]);
    expect(summary.totalRuns).toBe(4);
    expect(summary.regressedRuns).toBe(2);
    expect(summary.regressedRate).toBe(0.5);
  });

  it("breaks the counts down per ruleId with more than one rule present", () => {
    const summary = computeRegressedVerdictTrackRecord([
      comparison("rule_a", "regressed"),
      comparison("rule_b", "improved"),
      comparison("rule_a", "unchanged"),
      comparison("rule_b", "regressed"),
      comparison("rule_b", "regressed"),
    ]);
    expect(summary.totalRuns).toBe(5);
    expect(summary.regressedRuns).toBe(3);
    expect(summary.perRule.get("rule_a")).toEqual({ total: 2, regressed: 1, improved: 0, unchanged: 1 });
    expect(summary.perRule.get("rule_b")).toEqual({ total: 3, regressed: 2, improved: 1, unchanged: 0 });
  });
});
