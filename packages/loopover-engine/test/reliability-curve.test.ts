import assert from "node:assert/strict";
import { test } from "node:test";

import { computeReliabilityCurve, deriveThresholdSuggestion, RELIABILITY_SAMPLE_FLOOR, type BacktestCase } from "../dist/index.js";

function corpusCase(targetKey: string, label: BacktestCase["label"], confidence?: number): BacktestCase {
  return {
    ruleId: "linked_issue_scope_mismatch",
    targetKey,
    outcome: "unaddressed",
    label,
    firedAt: "2026-07-22T00:00:00.000Z",
    decidedAt: "2026-07-22T01:00:00.000Z",
    ...(confidence !== undefined ? { metadata: { confidence } } : {}),
  };
}

test("barrel: the public entrypoint re-exports the reliability-curve primitives (#8226)", () => {
  assert.equal(typeof computeReliabilityCurve, "function");
  assert.equal(typeof deriveThresholdSuggestion, "function");
  assert.equal(typeof RELIABILITY_SAMPLE_FLOOR, "number");
});

test("computeReliabilityCurve buckets decided cases and keeps a below-floor bucket's precision null", () => {
  const cases = Array.from({ length: RELIABILITY_SAMPLE_FLOOR }, (_, i) =>
    corpusCase(`hi#${i}`, i === 0 ? "reversed" : "confirmed", 0.9),
  );
  cases.push(corpusCase("lo#1", "reversed", 0.1));
  const curve = computeReliabilityCurve(cases, 2);
  assert.equal(curve.length, 2);
  assert.equal(curve[0]?.cases, 1);
  assert.equal(curve[0]?.precision, null);
  assert.equal(curve[1]?.cases, RELIABILITY_SAMPLE_FLOOR);
  assert.equal(curve[1]?.precision, (RELIABILITY_SAMPLE_FLOOR - 1) / RELIABILITY_SAMPLE_FLOOR);
});

test("deriveThresholdSuggestion returns the loosest qualifying floor at or above the hard minimum", () => {
  const cases = [
    ...Array.from({ length: RELIABILITY_SAMPLE_FLOOR }, (_, i) => corpusCase(`a#${i}`, "reversed", 0.1)),
    ...Array.from({ length: RELIABILITY_SAMPLE_FLOOR }, (_, i) => corpusCase(`b#${i}`, "confirmed", 0.9)),
  ];
  const curve = computeReliabilityCurve(cases, 2);
  assert.equal(deriveThresholdSuggestion(curve, 0.9, 0), 0.5);
  assert.equal(deriveThresholdSuggestion(curve, 1.01, 0), null);
});
