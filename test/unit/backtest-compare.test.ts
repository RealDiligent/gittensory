import { describe, expect, it } from "vitest";
import { compareBacktestScores } from "../../packages/loopover-engine/src/calibration/backtest-compare";
import type { BacktestScoreReport } from "../../packages/loopover-engine/src/calibration/backtest-score";

function report(overrides: Partial<BacktestScoreReport> = {}): BacktestScoreReport {
  return {
    ruleId: "missing_linked_issue",
    caseCount: 10,
    truePositive: 5,
    falsePositive: 2,
    trueNegative: 2,
    falseNegative: 1,
    precision: 0.5,
    recall: 0.5,
    ...overrides,
  };
}

describe("compareBacktestScores (#8086) — Pareto-floor comparator", () => {
  it("marks both-axes improvement as improved with no regressed axes", () => {
    const comparison = compareBacktestScores(report({ precision: 0.5, recall: 0.5 }), report({ precision: 0.6, recall: 0.7 }));
    expect(comparison.improvedAxes).toEqual(["precision", "recall"]);
    expect(comparison.regressedAxes).toEqual([]);
    expect(comparison.verdict).toBe("improved");
  });

  it("applies the Pareto floor: one axis improving while the other regresses is REGRESSED, never a trade", () => {
    const comparison = compareBacktestScores(report({ precision: 0.5, recall: 0.5 }), report({ precision: 0.9, recall: 0.4 }));
    expect(comparison.improvedAxes).toEqual(["precision"]);
    expect(comparison.regressedAxes).toEqual(["recall"]);
    expect(comparison.verdict).toBe("regressed");
  });

  it("marks a regression on a single axis with the other unchanged as regressed", () => {
    const comparison = compareBacktestScores(report({ precision: 0.5, recall: 0.5 }), report({ precision: 0.5, recall: 0.3 }));
    expect(comparison.regressedAxes).toEqual(["recall"]);
    expect(comparison.improvedAxes).toEqual([]);
    expect(comparison.verdict).toBe("regressed");
  });

  it("excludes an axis from both lists when either side is null — null is never 0 and never 'no change'", () => {
    const baselineNull = compareBacktestScores(report({ precision: null, recall: 0.5 }), report({ precision: 0.9, recall: 0.6 }));
    expect(baselineNull.improvedAxes).toEqual(["recall"]);
    expect(baselineNull.regressedAxes).toEqual([]);
    expect(baselineNull.verdict).toBe("improved");

    const candidateNull = compareBacktestScores(report({ precision: 0.5, recall: 0.5 }), report({ precision: 0.4, recall: null }));
    expect(candidateNull.regressedAxes).toEqual(["precision"]);
    expect(candidateNull.improvedAxes).toEqual([]);
    expect(candidateNull.verdict).toBe("regressed");
  });

  it("returns unchanged when every comparable axis is equal", () => {
    const comparison = compareBacktestScores(report(), report());
    expect(comparison.improvedAxes).toEqual([]);
    expect(comparison.regressedAxes).toEqual([]);
    expect(comparison.verdict).toBe("unchanged");
  });

  it("returns unchanged when both axes are null on a side (nothing comparable at all)", () => {
    const comparison = compareBacktestScores(report({ precision: null, recall: null }), report({ precision: 0.9, recall: 0.9 }));
    expect(comparison.verdict).toBe("unchanged");
  });

  it("throws on mismatched ruleIds, naming both rules in the message", () => {
    expect(() => compareBacktestScores(report({ ruleId: "rule_a" }), report({ ruleId: "rule_b" }))).toThrow(
      "cannot compare backtest scores for different rules: rule_a vs rule_b",
    );
  });

  it("carries both input reports and the shared ruleId through to the comparison record", () => {
    const baseline = report();
    const candidate = report({ precision: 0.6 });
    const comparison = compareBacktestScores(baseline, candidate);
    expect(comparison.ruleId).toBe("missing_linked_issue");
    expect(comparison.baseline).toBe(baseline);
    expect(comparison.candidate).toBe(candidate);
  });
});
