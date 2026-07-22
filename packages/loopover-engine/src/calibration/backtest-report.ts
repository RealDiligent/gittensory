// Markdown rendering for backtest score/comparison data (#8088, part of the #8082 rule-precision
// backtest epic). BacktestScoreReport (#8085) and BacktestComparison (#8086) are plain data; this is the
// human-readable "receipt" a maintainer (and, per the parent epic, eventually an advisory CI comment)
// reads directly -- a deterministic pure function producing stable Markdown, not ad-hoc console logging.
//
// SELF-CONTAINED, PURE: string in, string out -- no IO, no wall-clock reads, byte-identical output for
// byte-identical input, the same posture as the rest of this calibration directory.

import type { BacktestComparison } from "./backtest-compare.js";
import type { BacktestScoreReport } from "./backtest-score.js";

/** Render null precision/recall as the literal `N/A` -- never 0, the word null, or an empty cell,
 *  mirroring the null-is-not-zero discipline BacktestScoreReport itself establishes (#8085). */
function formatAxisValue(value: number | null): string {
  return value === null ? "N/A" : String(value);
}

/**
 * Render one {@link BacktestScoreReport} as a Markdown table: the rule ID, case count, all four
 * confusion-matrix counts, and precision/recall (null rendered as `N/A`).
 */
export function renderBacktestScoreReport(report: BacktestScoreReport): string {
  return [
    `### Backtest score: \`${report.ruleId}\``,
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Cases scored | ${report.caseCount} |`,
    `| True positives | ${report.truePositive} |`,
    `| False positives | ${report.falsePositive} |`,
    `| True negatives | ${report.trueNegative} |`,
    `| False negatives | ${report.falseNegative} |`,
    `| Precision | ${formatAxisValue(report.precision)} |`,
    `| Recall | ${formatAxisValue(report.recall)} |`,
    "",
  ].join("\n");
}

/**
 * Render one {@link BacktestComparison} as Markdown: regressed axes under a "Regressed" heading,
 * improved axes under a visually separate "Improved" heading (a section with no axes is omitted
 * entirely, so nothing ever reads as regressed when it isn't), and a closing verdict line. The
 * `"regressed"` closing line contains the literal word `REGRESSED` and states the change should not be
 * merged -- exact wording a future automated consumer (the follow-up CI wiring) detects by string match
 * without re-implementing the comparison logic.
 */
export function renderBacktestComparison(comparison: BacktestComparison): string {
  const lines: string[] = [`### Backtest comparison: \`${comparison.ruleId}\``, ""];
  if (comparison.regressedAxes.length > 0) {
    lines.push("**Regressed**");
    for (const axis of comparison.regressedAxes) {
      lines.push(`- ${axis}: ${formatAxisValue(comparison.baseline[axis])} → ${formatAxisValue(comparison.candidate[axis])}`);
    }
    lines.push("");
  }
  if (comparison.improvedAxes.length > 0) {
    lines.push("**Improved**");
    for (const axis of comparison.improvedAxes) {
      lines.push(`- ${axis}: ${formatAxisValue(comparison.baseline[axis])} → ${formatAxisValue(comparison.candidate[axis])}`);
    }
    lines.push("");
  }
  if (comparison.verdict === "regressed") {
    lines.push("Verdict: REGRESSED — do not merge.");
  } else if (comparison.verdict === "improved") {
    lines.push("Verdict: improved — no axis regressed.");
  } else {
    lines.push("Verdict: unchanged — no comparable axis moved.");
  }
  lines.push("");
  return lines.join("\n");
}
