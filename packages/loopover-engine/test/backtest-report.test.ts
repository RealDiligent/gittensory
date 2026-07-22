import assert from "node:assert/strict";
import { test } from "node:test";

import {
  renderBacktestComparison,
  renderBacktestScoreReport,
  type BacktestComparison,
  type BacktestScoreReport,
} from "../dist/index.js";

function report(overrides: Partial<BacktestScoreReport> = {}): BacktestScoreReport {
  return {
    ruleId: "missing_linked_issue",
    caseCount: 4,
    truePositive: 1,
    falsePositive: 1,
    trueNegative: 1,
    falseNegative: 1,
    precision: 0.5,
    recall: 0.5,
    ...overrides,
  };
}

function comparison(overrides: Partial<BacktestComparison> = {}): BacktestComparison {
  return {
    ruleId: "missing_linked_issue",
    baseline: report(),
    candidate: report({ precision: 0.75 }),
    regressedAxes: [],
    improvedAxes: ["precision"],
    verdict: "improved",
    ...overrides,
  };
}

test("barrel: the public entrypoint re-exports both backtest renderers (#8088)", () => {
  assert.equal(typeof renderBacktestScoreReport, "function");
  assert.equal(typeof renderBacktestComparison, "function");
});

test("renderBacktestScoreReport: renders every count and both non-null axes, snapshot-exact", () => {
  const rendered = renderBacktestScoreReport(report());
  assert.equal(
    rendered,
    [
      "### Backtest score: `missing_linked_issue`",
      "",
      "| Metric | Value |",
      "| --- | --- |",
      "| Cases scored | 4 |",
      "| True positives | 1 |",
      "| False positives | 1 |",
      "| True negatives | 1 |",
      "| False negatives | 1 |",
      "| Precision | 0.5 |",
      "| Recall | 0.5 |",
      "",
    ].join("\n"),
  );
});

test("renderBacktestScoreReport: null precision/recall render as N/A, never 0 or the word null", () => {
  const rendered = renderBacktestScoreReport(report({ precision: null, recall: null }));
  assert.ok(rendered.includes("| Precision | N/A |"));
  assert.ok(rendered.includes("| Recall | N/A |"));
  assert.ok(!rendered.includes("null"));
});

test("renderBacktestComparison: a regressed verdict contains the literal REGRESSED and a do-not-merge line", () => {
  const rendered = renderBacktestComparison(
    comparison({ regressedAxes: ["recall"], improvedAxes: ["precision"], verdict: "regressed", candidate: report({ precision: 0.9, recall: 0.4 }) }),
  );
  assert.ok(rendered.includes("REGRESSED"));
  assert.ok(rendered.includes("do not merge"));
  assert.ok(rendered.includes("**Regressed**"));
  assert.ok(rendered.includes("- recall: 0.5 → 0.4"));
});

test("renderBacktestComparison: improved-only output claims no regressed axis", () => {
  const rendered = renderBacktestComparison(comparison());
  assert.ok(rendered.includes("**Improved**"));
  assert.ok(rendered.includes("- precision: 0.5 → 0.75"));
  assert.ok(!rendered.includes("**Regressed**"));
  assert.ok(rendered.includes("Verdict: improved"));
});

test("renderBacktestComparison / renderBacktestScoreReport: byte-identical output for identical input", () => {
  assert.equal(renderBacktestScoreReport(report()), renderBacktestScoreReport(report()));
  assert.equal(renderBacktestComparison(comparison()), renderBacktestComparison(comparison()));
});
