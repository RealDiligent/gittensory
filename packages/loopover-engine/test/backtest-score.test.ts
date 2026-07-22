import assert from "node:assert/strict";
import { test } from "node:test";

import { scoreBacktest, type BacktestCase } from "../dist/index.js";

function testCase(label: BacktestCase["label"], targetKey: string, ruleId = "missing_linked_issue"): BacktestCase {
  return {
    ruleId,
    targetKey,
    outcome: "block",
    label,
    firedAt: "2026-07-22T00:00:00.000Z",
    decidedAt: "2026-07-22T01:00:00.000Z",
  };
}

test("barrel: the public entrypoint re-exports the backtest scorer (#8085)", () => {
  assert.equal(typeof scoreBacktest, "function");
});

test("scoreBacktest: an all-correct classifier scores precision 1 and recall 1", () => {
  const cases = [testCase("reversed", "a#1"), testCase("confirmed", "a#2"), testCase("reversed", "a#3")];
  const report = scoreBacktest("missing_linked_issue", cases, (item) => item.label);
  assert.deepEqual(report, {
    ruleId: "missing_linked_issue",
    caseCount: 3,
    truePositive: 2,
    falsePositive: 0,
    trueNegative: 1,
    falseNegative: 0,
    precision: 1,
    recall: 1,
  });
});

test("scoreBacktest: an all-wrong classifier scores precision 0 and recall 0 with the exact FP/FN counts", () => {
  const cases = [testCase("reversed", "a#1"), testCase("confirmed", "a#2")];
  const report = scoreBacktest("missing_linked_issue", cases, (item) => (item.label === "reversed" ? "confirmed" : "reversed"));
  assert.equal(report.falsePositive, 1); // predicted reversed for the confirmed case
  assert.equal(report.falseNegative, 1); // predicted confirmed for the reversed case
  assert.equal(report.truePositive, 0);
  assert.equal(report.trueNegative, 0);
  assert.equal(report.precision, 0);
  assert.equal(report.recall, 0);
});

test("scoreBacktest: a mixed classifier accumulates all four confusion-matrix counts", () => {
  const cases = [
    testCase("reversed", "a#1"), // predicted reversed  -> TP
    testCase("confirmed", "a#2"), // predicted reversed -> FP
    testCase("confirmed", "a#3"), // predicted confirmed -> TN
    testCase("reversed", "a#4"), // predicted confirmed -> FN
  ];
  const predictions: Record<string, "reversed" | "confirmed"> = {
    "a#1": "reversed",
    "a#2": "reversed",
    "a#3": "confirmed",
    "a#4": "confirmed",
  };
  const report = scoreBacktest("missing_linked_issue", cases, (item) => predictions[item.targetKey] ?? "confirmed");
  assert.equal(report.caseCount, 4);
  assert.equal(report.truePositive, 1);
  assert.equal(report.falsePositive, 1);
  assert.equal(report.trueNegative, 1);
  assert.equal(report.falseNegative, 1);
  assert.equal(report.precision, 0.5);
  assert.equal(report.recall, 0.5);
});

test("scoreBacktest: an empty corpus scores zero counts with null precision AND null recall", () => {
  const report = scoreBacktest("missing_linked_issue", [], () => "reversed");
  assert.deepEqual(report, {
    ruleId: "missing_linked_issue",
    caseCount: 0,
    truePositive: 0,
    falsePositive: 0,
    trueNegative: 0,
    falseNegative: 0,
    precision: null,
    recall: null,
  });
});

test("scoreBacktest: null precision with a real recall when the classifier never predicts reversed", () => {
  const report = scoreBacktest("missing_linked_issue", [testCase("reversed", "a#1")], () => "confirmed");
  assert.equal(report.precision, null); // TP + FP === 0
  assert.equal(report.recall, 0); // TP / (TP + FN) = 0/1
});

test("scoreBacktest: null recall with a real precision when the corpus has no reversed labels", () => {
  const report = scoreBacktest("missing_linked_issue", [testCase("confirmed", "a#1")], () => "reversed");
  assert.equal(report.recall, null); // TP + FN === 0
  assert.equal(report.precision, 0); // TP / (TP + FP) = 0/1
});

test("scoreBacktest: cases for a different ruleId are excluded from every count, caseCount included", () => {
  const classifyCalls: string[] = [];
  const report = scoreBacktest(
    "missing_linked_issue",
    [testCase("reversed", "a#1"), testCase("reversed", "b#1", "other_rule")],
    (item) => {
      classifyCalls.push(item.targetKey);
      return "reversed";
    },
  );
  assert.equal(report.caseCount, 1);
  assert.equal(report.truePositive, 1);
  assert.deepEqual(classifyCalls, ["a#1"]); // the non-matching case is never even classified
});
