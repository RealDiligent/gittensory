// Governor budget/turn/termination cap calculator (pure).
// Deterministic, side-effect-free cumulative cap math for the local Governor. Given a caller-supplied usage
// snapshot and configured ceilings it decides whether another action is permitted and how much budget, turn
// headroom, and elapsed session time remain. This module computes a verdict only — it does NOT store state,
// schedule anything, or gate any write action; that enforcement wiring is separate maintainer-owned work (#2340).

import type { GovernorLedgerEventType } from "../governor-ledger.js";

export type GovernorCapLimits = {
  /** Maximum cumulative cost/budget units permitted for the run (omit to disable this cap). */
  maxBudget?: number;
  /** Maximum iteration/turn count permitted for the run (omit to disable this cap). */
  maxTurns?: number;
  /** Maximum elapsed session time in milliseconds (omit to disable this cap). */
  maxElapsedMs?: number;
};

export type GovernorCapUsage = {
  /** Cumulative cost/budget units already consumed. */
  budgetSpent: number;
  /** Iteration/turn count already taken. */
  turnsTaken: number;
  /** Elapsed session time in milliseconds (caller-supplied; never read from a clock here). */
  elapsedMs: number;
};

export type GovernorCapDimension = "budget" | "turns" | "termination";

export type GovernorCapVerdict = {
  /** Verdict vocabulary aligned with GOVERNOR_LEDGER_EVENT_TYPES for downstream ledger wiring. */
  eventType: GovernorLedgerEventType;
  /** Whether another action is permitted under the configured caps. */
  allowed: boolean;
  /** Human-readable reason for the verdict. */
  reason: string;
  /** Remaining budget headroom (`null` when the budget cap is disabled). */
  remainingBudget: number | null;
  /** Remaining turn headroom (`null` when the turn cap is disabled). */
  remainingTurns: number | null;
  /** Remaining elapsed-time headroom in ms (`null` when the termination cap is disabled). */
  remainingElapsedMs: number | null;
  /** Cap dimensions that are at or over their configured ceiling. */
  triggeredCaps: GovernorCapDimension[];
};

function finiteNonNegativeInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function remainingHeadroom(limit: number | undefined, usage: number): number | null {
  if (limit === undefined) return null;
  return Math.max(0, finiteNonNegativeInt(limit) - finiteNonNegativeInt(usage));
}

function isCapTriggered(limit: number | undefined, usage: number): boolean {
  if (limit === undefined) return false;
  return finiteNonNegativeInt(usage) >= finiteNonNegativeInt(limit);
}

/**
 * Evaluate cumulative budget, turn, and termination caps from a caller-supplied usage snapshot. Pure: it
 * reads the inputs and returns a verdict without mutating anything. Every numeric input is normalized first,
 * so a non-finite or negative value can never produce NaN or negative remaining headroom.
 */
export function evaluateGovernorCaps(usage: GovernorCapUsage, limits: GovernorCapLimits): GovernorCapVerdict {
  const budgetSpent = finiteNonNegativeInt(usage.budgetSpent);
  const turnsTaken = finiteNonNegativeInt(usage.turnsTaken);
  const elapsedMs = finiteNonNegativeInt(usage.elapsedMs);

  const triggeredCaps: GovernorCapDimension[] = [];
  if (isCapTriggered(limits.maxBudget, budgetSpent)) triggeredCaps.push("budget");
  if (isCapTriggered(limits.maxTurns, turnsTaken)) triggeredCaps.push("turns");
  if (isCapTriggered(limits.maxElapsedMs, elapsedMs)) triggeredCaps.push("termination");

  const remainingBudget = remainingHeadroom(limits.maxBudget, budgetSpent);
  const remainingTurns = remainingHeadroom(limits.maxTurns, turnsTaken);
  const remainingElapsedMs = remainingHeadroom(limits.maxElapsedMs, elapsedMs);

  if (triggeredCaps.length === 0) {
    return {
      eventType: "allowed",
      allowed: true,
      reason: "within_governor_caps",
      remainingBudget,
      remainingTurns,
      remainingElapsedMs,
      triggeredCaps,
    };
  }

  if (triggeredCaps.includes("termination")) {
    return {
      eventType: "kill_switch",
      allowed: false,
      reason: "termination_cap_exceeded",
      remainingBudget,
      remainingTurns,
      remainingElapsedMs,
      triggeredCaps,
    };
  }

  return {
    eventType: "denied",
    allowed: false,
    reason: triggeredCaps.includes("budget") && triggeredCaps.includes("turns")
      ? "budget_and_turn_caps_exceeded"
      : triggeredCaps.includes("budget")
        ? "budget_cap_exceeded"
        : "turn_cap_exceeded",
    remainingBudget,
    remainingTurns,
    remainingElapsedMs,
    triggeredCaps,
  };
}
