// Labeled backtest corpus builder (#8083, part of the #8082 rule-precision backtest epic). Where
// signal-tracking.ts's computeRulePrecision collapses a rule's fired/override history into ONE aggregate
// precision number, a backtest needs each PAIRED case kept as an individual labeled record -- a concrete
// "this rule fired against this target, and a human later said it was right/wrong" row, replayable against
// a different candidate rule/classifier later.
//
// SELF-CONTAINED, STORAGE-AGNOSTIC: pure TypeScript, no IO, no DB, no env -- only the existing
// RuleFiredEvent/HumanOverrideEvent types from signal-tracking.ts, mirroring that module's own
// "pure calibration math here, storage at the host layer" posture (see its header comment).

import type { HumanOverrideEvent, RuleFiredEvent } from "./signal-tracking.js";

/** One labeled backtest case: a specific rule firing (`firedAt`, with the fired event's `outcome` and
 *  optional `metadata`) joined to the human verdict that judged it (`label`, at `decidedAt`). `metadata`
 *  is omitted entirely (not set to `undefined`) when the fired event carried none -- the same
 *  optional-property discipline {@link RuleFiredEvent} itself uses. */
export type BacktestCase = {
  ruleId: string;
  targetKey: string;
  outcome: string;
  label: "reversed" | "confirmed";
  firedAt: string;
  decidedAt: string;
  metadata?: Record<string, unknown>;
};

/** True for an override event that targets the same rule as `ruleId` -- mirrors signal-tracking.ts's own
 *  private `overrideMatchesRule` helper (deliberately NOT exported from there; this issue is additive-only
 *  in a new file, so the one-line filter is mirrored here instead). */
function overrideMatchesRule(event: HumanOverrideEvent, ruleId: string): boolean {
  return event.ruleId === ruleId;
}

/**
 * Pick the override that judges `firedEvent`: the one whose `occurredAt` is closest in time strictly AFTER
 * the fired event's own `occurredAt` (a verdict naturally follows the firing it judges); when none strictly
 * follows it (e.g. clock skew, or a verdict recorded against an earlier fire of the same target), fall back
 * to the most recent override by `occurredAt`. Ties keep the first candidate encountered, so the choice is
 * deterministic for a fixed input order.
 */
function pairedOverrideFor(firedEvent: RuleFiredEvent, candidates: readonly HumanOverrideEvent[]): HumanOverrideEvent | null {
  const firedMs = Date.parse(firedEvent.occurredAt);
  let nearestAfter: HumanOverrideEvent | null = null;
  let nearestAfterMs = Number.POSITIVE_INFINITY;
  let mostRecent: HumanOverrideEvent | null = null;
  let mostRecentMs = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const candidateMs = Date.parse(candidate.occurredAt);
    if (candidateMs > firedMs && candidateMs - firedMs < nearestAfterMs) {
      nearestAfter = candidate;
      nearestAfterMs = candidateMs - firedMs;
    }
    if (candidateMs > mostRecentMs) {
      mostRecent = candidate;
      mostRecentMs = candidateMs;
    }
  }
  return nearestAfter ?? mostRecent;
}

/**
 * Build the labeled backtest corpus for `ruleId` from its fired + override events. A fired event and an
 * override pair into one {@link BacktestCase} when both carry the function's `ruleId` AND the same
 * `targetKey`. A fired event with NO matching override is excluded from the result (not included as an
 * unlabeled case) -- mirrors {@link computeRulePrecision}'s "only the decided ones count" discipline.
 * When a target has been re-fired and re-judged more than once, each fired event pairs with the override
 * whose `occurredAt` is closest in time strictly after that specific firing; if none strictly follows it,
 * the most recent override by `occurredAt` stands in (see {@link pairedOverrideFor}) -- one case per fired
 * event, never duplicates. Only events whose `ruleId` equals the argument are considered; like
 * computeRulePrecision, a caller MAY pass mixed-rule event lists without filtering first.
 */
export function buildBacktestCorpus(
  ruleId: string,
  fired: readonly RuleFiredEvent[],
  overrides: readonly HumanOverrideEvent[],
): BacktestCase[] {
  const cases: BacktestCase[] = [];
  for (const firedEvent of fired) {
    if (firedEvent.ruleId !== ruleId) continue;
    const candidates = overrides.filter(
      (event) => overrideMatchesRule(event, ruleId) && event.targetKey === firedEvent.targetKey,
    );
    const override = pairedOverrideFor(firedEvent, candidates);
    if (!override) continue;
    cases.push({
      ruleId,
      targetKey: firedEvent.targetKey,
      outcome: firedEvent.outcome,
      label: override.verdict,
      firedAt: firedEvent.occurredAt,
      decidedAt: override.occurredAt,
      ...(firedEvent.metadata !== undefined ? { metadata: firedEvent.metadata } : {}),
    });
  }
  return cases;
}
