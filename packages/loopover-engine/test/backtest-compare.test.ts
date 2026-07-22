import assert from "node:assert/strict";
import { test } from "node:test";

import { compareBacktestScores, type BacktestScoreReport } from "../dist/index.js";

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

test("barrel: the public entrypoint re-exports the backtest comparator (#8086)", () => {
  assert.equal(typeof compareBacktestScores, "function");
});

test("compareBacktestScores: both axes improving is an improved verdict with no regressed axes", () => {
  const comparison = compareBacktestScores(report({ precision: 0.5, recall: 0.5 }), report({ precision: 0.6, recall: 0.7 }));
  assert.deepEqual(comparison.improvedAxes, ["precision", "recall"]);
  assert.deepEqual(comparison.regressedAxes, []);
  assert.equal(comparison.verdict, "improved");
});

test("compareBacktestScores: PARETO FLOOR -- one axis improving while the other regresses is REGRESSED", () => {
  const comparison = compareBacktestScores(report({ precision: 0.5, recall: 0.5 }), report({ precision: 0.9, recall: 0.4 }));
  assert.deepEqual(comparison.improvedAxes, ["precision"]);
  assert.deepEqual(comparison.regressedAxes, ["recall"]);
  assert.equal(comparison.verdict, "regressed");
});

test("compareBacktestScores: a null axis on either side is excluded from both lists, never treated as 0", () => {
  const comparison = compareBacktestScores(report({ precision: null, recall: 0.5 }), report({ precision: 0.9, recall: 0.6 }));
  assert.deepEqual(comparison.improvedAxes, ["recall"]);
  assert.deepEqual(comparison.regressedAxes, []);
  assert.equal(comparison.verdict, "improved");
});

test("compareBacktestScores: equal axes on both sides is an unchanged verdict", () => {
  const comparison = compareBacktestScores(report(), report());
  assert.deepEqual(comparison.improvedAxes, []);
  assert.deepEqual(comparison.regressedAxes, []);
  assert.equal(comparison.verdict, "unchanged");
});

test("compareBacktestScores: mismatched ruleIds throw, naming both rules", () => {
  assert.throws(
    () => compareBacktestScores(report({ ruleId: "rule_a" }), report({ ruleId: "rule_b" })),
    /cannot compare backtest scores for different rules: rule_a vs rule_b/,
  );
});
