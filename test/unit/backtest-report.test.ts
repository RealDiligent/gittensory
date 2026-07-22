import { describe, expect, it } from "vitest";
import type { BacktestComparison } from "../../packages/loopover-engine/src/calibration/backtest-compare";
import { renderBacktestComparison, renderBacktestScoreReport } from "../../packages/loopover-engine/src/calibration/backtest-report";
import type { BacktestScoreReport } from "../../packages/loopover-engine/src/calibration/backtest-score";

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

describe("renderBacktestScoreReport (#8088)", () => {
  it("renders every count and both non-null axes, snapshot-exact", () => {
    expect(renderBacktestScoreReport(report())).toBe(
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

  it("renders null precision/recall as N/A — never 0, never the word null", () => {
    const rendered = renderBacktestScoreReport(report({ precision: null, recall: null }));
    expect(rendered).toContain("| Precision | N/A |");
    expect(rendered).toContain("| Recall | N/A |");
    expect(rendered).not.toContain("null");
  });

  it("is byte-identical for identical input", () => {
    expect(renderBacktestScoreReport(report())).toBe(renderBacktestScoreReport(report()));
  });
});

describe("renderBacktestComparison (#8088)", () => {
  it("renders a regressed verdict with the literal REGRESSED, a do-not-merge line, and the regressed axis sectioned", () => {
    const rendered = renderBacktestComparison(
      comparison({
        regressedAxes: ["recall"],
        improvedAxes: ["precision"],
        verdict: "regressed",
        candidate: report({ precision: 0.9, recall: 0.4 }),
      }),
    );
    expect(rendered).toContain("Verdict: REGRESSED — do not merge.");
    expect(rendered).toContain("**Regressed**");
    expect(rendered).toContain("- recall: 0.5 → 0.4");
    expect(rendered).toContain("**Improved**");
    expect(rendered).toContain("- precision: 0.5 → 0.9");
    // The regressed axis never bleeds into the improved section and vice versa.
    expect(rendered.indexOf("**Regressed**")).toBeLessThan(rendered.indexOf("- recall:"));
    expect(rendered.indexOf("- recall:")).toBeLessThan(rendered.indexOf("**Improved**"));
  });

  it("renders improved-only output without claiming any regressed axis", () => {
    const rendered = renderBacktestComparison(comparison());
    expect(rendered).toContain("**Improved**");
    expect(rendered).toContain("Verdict: improved — no axis regressed.");
    expect(rendered).not.toContain("**Regressed**");
  });

  it("renders an unchanged verdict with neither axis section", () => {
    const rendered = renderBacktestComparison(comparison({ improvedAxes: [], verdict: "unchanged", candidate: report() }));
    expect(rendered).toContain("Verdict: unchanged — no comparable axis moved.");
    expect(rendered).not.toContain("**Regressed**");
    expect(rendered).not.toContain("**Improved**");
  });

  it("renders N/A for a null axis endpoint inside a section line", () => {
    const rendered = renderBacktestComparison(
      comparison({
        baseline: report({ recall: 0.5 }),
        candidate: report({ recall: null, precision: 0.75 }),
        regressedAxes: [],
        improvedAxes: ["precision"],
        verdict: "improved",
      }),
    );
    expect(rendered).toContain("- precision: 0.5 → 0.75");
  });

  it("is byte-identical for identical input", () => {
    expect(renderBacktestComparison(comparison())).toBe(renderBacktestComparison(comparison()));
  });
});
