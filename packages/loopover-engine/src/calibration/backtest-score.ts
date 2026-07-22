// Pure confusion-matrix scorer for a candidate rule classifier against the backtest corpus (#8085, part
// of the #8082 rule-precision backtest epic). The BacktestCase corpus (#8083) is a labeled history --
// "this rule fired against this target, a human later said reversed/confirmed"; this module answers "if a
// DIFFERENT/proposed version of the rule had been run against the same targets, would it have gotten more
// of them right?" by replaying a caller-supplied classifier over the corpus and comparing against the real
// labels. Mirrors src/review/auto-tune.ts's GateEvalRow confusion-matrix shape (wouldMerge/mergeConfirmed/
// mergeFalse/decided/mergePrecision) at a backtest-replay grain instead of a live-eval grain.
//
// SELF-CONTAINED, PURE: no IO, no randomness, no wall-clock reads -- the same posture as the rest of this
// calibration directory. `classify` is deliberately a plain synchronous function so thousands of
// historical cases stay scorable against a fast, in-memory candidate rule implementation.

import type { BacktestCase } from "./backtest-corpus.js";

// Convention: "reversed" is the positive class. A classifier that correctly predicts a case's real
// label of "reversed" (i.e. correctly identifies that the rule's original firing was WRONG) is a true
// positive. This is a deliberate, non-obvious choice — keep this comment attached to the type.
export type BacktestScoreReport = {
  ruleId: string;
  caseCount: number;
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
  precision: number | null;
  recall: number | null;
};

/**
 * Score `classify` against every case in `cases` whose `ruleId` matches, accumulating the four
 * confusion-matrix counts against the cases' real labels ("reversed" is the positive class -- see the
 * comment on {@link BacktestScoreReport}). Cases for a different `ruleId` are excluded from every count,
 * `caseCount` included -- the same defensive filtering computeRulePrecision applies to its overrides.
 * `precision` and `recall` are null when their denominator is 0 (never coerced to 0 or 1), the same
 * "unknown stays unknown" discipline as RulePrecisionReport.precision in signal-tracking.ts.
 */
export function scoreBacktest(
  ruleId: string,
  cases: readonly BacktestCase[],
  classify: (backtestCase: BacktestCase) => "reversed" | "confirmed",
): BacktestScoreReport {
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;
  let caseCount = 0;
  for (const backtestCase of cases) {
    if (backtestCase.ruleId !== ruleId) continue;
    caseCount += 1;
    const predicted = classify(backtestCase);
    if (predicted === "reversed") {
      if (backtestCase.label === "reversed") truePositive += 1;
      else falsePositive += 1;
    } else {
      if (backtestCase.label === "confirmed") trueNegative += 1;
      else falseNegative += 1;
    }
  }
  return {
    ruleId,
    caseCount,
    truePositive,
    falsePositive,
    trueNegative,
    falseNegative,
    precision: truePositive + falsePositive > 0 ? truePositive / (truePositive + falsePositive) : null,
    recall: truePositive + falseNegative > 0 ? truePositive / (truePositive + falseNegative) : null,
  };
}
