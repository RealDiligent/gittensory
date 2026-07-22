import { describe, expect, it } from "vitest";
import type { BacktestCase } from "../../packages/loopover-engine/src/calibration/backtest-corpus";
import { scoreBacktest } from "../../packages/loopover-engine/src/calibration/backtest-score";

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

describe("scoreBacktest (#8085) — pure confusion-matrix scorer over the backtest corpus", () => {
  it("scores an all-correct classifier at precision 1 and recall 1", () => {
    const cases = [testCase("reversed", "a#1"), testCase("confirmed", "a#2"), testCase("reversed", "a#3")];
    expect(scoreBacktest("missing_linked_issue", cases, (item) => item.label)).toEqual({
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

  it("scores an all-wrong classifier at precision 0 and recall 0 with exact FP/FN counts", () => {
    const cases = [testCase("reversed", "a#1"), testCase("confirmed", "a#2")];
    const report = scoreBacktest("missing_linked_issue", cases, (item) => (item.label === "reversed" ? "confirmed" : "reversed"));
    expect(report.falsePositive).toBe(1);
    expect(report.falseNegative).toBe(1);
    expect(report.truePositive).toBe(0);
    expect(report.trueNegative).toBe(0);
    expect(report.precision).toBe(0);
    expect(report.recall).toBe(0);
  });

  it("accumulates all four confusion-matrix counts for a mixed classifier", () => {
    const cases = [
      testCase("reversed", "a#1"),
      testCase("confirmed", "a#2"),
      testCase("confirmed", "a#3"),
      testCase("reversed", "a#4"),
    ];
    const predictions: Record<string, "reversed" | "confirmed"> = {
      "a#1": "reversed",
      "a#2": "reversed",
      "a#3": "confirmed",
      "a#4": "confirmed",
    };
    const report = scoreBacktest("missing_linked_issue", cases, (item) => predictions[item.targetKey] ?? "confirmed");
    expect([report.truePositive, report.falsePositive, report.trueNegative, report.falseNegative]).toEqual([1, 1, 1, 1]);
    expect(report.precision).toBe(0.5);
    expect(report.recall).toBe(0.5);
  });

  it("scores an empty corpus as zero counts with null precision AND null recall", () => {
    expect(scoreBacktest("missing_linked_issue", [], () => "reversed")).toEqual({
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

  it("keeps precision null (never coerced) when the classifier never predicts reversed", () => {
    const report = scoreBacktest("missing_linked_issue", [testCase("reversed", "a#1")], () => "confirmed");
    expect(report.precision).toBeNull();
    expect(report.recall).toBe(0);
  });

  it("keeps recall null (never coerced) when the corpus has no reversed labels", () => {
    const report = scoreBacktest("missing_linked_issue", [testCase("confirmed", "a#1")], () => "reversed");
    expect(report.recall).toBeNull();
    expect(report.precision).toBe(0);
  });

  it("excludes cases for a different ruleId from every count, caseCount included, without classifying them", () => {
    const classified: string[] = [];
    const report = scoreBacktest(
      "missing_linked_issue",
      [testCase("reversed", "a#1"), testCase("reversed", "b#1", "other_rule")],
      (item) => {
        classified.push(item.targetKey);
        return "reversed";
      },
    );
    expect(report.caseCount).toBe(1);
    expect(report.truePositive).toBe(1);
    expect(classified).toEqual(["a#1"]);
  });
});
