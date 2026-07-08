import { describe, expect, it } from "vitest";
import {
  evaluateGovernorCaps,
  type GovernorCapLimits,
  type GovernorCapUsage,
} from "../../packages/gittensory-engine/src/governor/budget-cap";

const limits: GovernorCapLimits = { maxBudget: 100, maxTurns: 10, maxElapsedMs: 60_000 };

describe("evaluateGovernorCaps (#4288)", () => {
  it("permits when every configured cap is under its ceiling", () => {
    const usage: GovernorCapUsage = { budgetSpent: 40, turnsTaken: 3, elapsedMs: 30_000 };
    const verdict = evaluateGovernorCaps(usage, limits);
    expect(verdict).toEqual({
      eventType: "allowed",
      allowed: true,
      reason: "within_governor_caps",
      remainingBudget: 60,
      remainingTurns: 7,
      remainingElapsedMs: 30_000,
      triggeredCaps: [],
    });
  });

  it("blocks at the budget ceiling with remaining headroom zero", () => {
    const verdict = evaluateGovernorCaps({ budgetSpent: 100, turnsTaken: 0, elapsedMs: 0 }, limits);
    expect(verdict.allowed).toBe(false);
    expect(verdict.eventType).toBe("denied");
    expect(verdict.reason).toBe("budget_cap_exceeded");
    expect(verdict.remainingBudget).toBe(0);
    expect(verdict.triggeredCaps).toEqual(["budget"]);
  });

  it("blocks at the turn ceiling", () => {
    const verdict = evaluateGovernorCaps({ budgetSpent: 0, turnsTaken: 10, elapsedMs: 0 }, limits);
    expect(verdict.eventType).toBe("denied");
    expect(verdict.reason).toBe("turn_cap_exceeded");
    expect(verdict.remainingTurns).toBe(0);
    expect(verdict.triggeredCaps).toEqual(["turns"]);
  });

  it("blocks at the termination ceiling with kill_switch", () => {
    const verdict = evaluateGovernorCaps({ budgetSpent: 0, turnsTaken: 0, elapsedMs: 60_000 }, limits);
    expect(verdict.eventType).toBe("kill_switch");
    expect(verdict.reason).toBe("termination_cap_exceeded");
    expect(verdict.remainingElapsedMs).toBe(0);
    expect(verdict.triggeredCaps).toEqual(["termination"]);
  });

  it("prefers kill_switch when termination and budget caps are both exceeded", () => {
    const verdict = evaluateGovernorCaps({ budgetSpent: 200, turnsTaken: 0, elapsedMs: 90_000 }, limits);
    expect(verdict.eventType).toBe("kill_switch");
    expect(verdict.triggeredCaps).toEqual(expect.arrayContaining(["budget", "termination"]));
  });

  it("reports combined budget and turn denial when both are exceeded", () => {
    const verdict = evaluateGovernorCaps({ budgetSpent: 150, turnsTaken: 12, elapsedMs: 0 }, limits);
    expect(verdict.eventType).toBe("denied");
    expect(verdict.reason).toBe("budget_and_turn_caps_exceeded");
    expect(verdict.triggeredCaps).toEqual(expect.arrayContaining(["budget", "turns"]));
  });

  it("treats omitted limits as disabled dimensions with null remaining headroom", () => {
    const verdict = evaluateGovernorCaps(
      { budgetSpent: 999, turnsTaken: 999, elapsedMs: 999_999 },
      {},
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.remainingBudget).toBeNull();
    expect(verdict.remainingTurns).toBeNull();
    expect(verdict.remainingElapsedMs).toBeNull();
  });

  it("normalizes non-finite and negative inputs so remaining values are never NaN or negative", () => {
    const verdict = evaluateGovernorCaps(
      { budgetSpent: NaN, turnsTaken: -3.9, elapsedMs: Number.POSITIVE_INFINITY },
      { maxBudget: NaN, maxTurns: -5, maxElapsedMs: 1_000 },
    );
    for (const value of [verdict.remainingBudget, verdict.remainingTurns, verdict.remainingElapsedMs]) {
      if (value !== null) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
    expect(verdict.allowed).toBe(false);
    expect(verdict.eventType).toBe("denied");
    expect(verdict.reason).toBe("budget_and_turn_caps_exceeded");
  });

  it("floors fractional usage before comparing against integer caps", () => {
    const verdict = evaluateGovernorCaps(
      { budgetSpent: 9.9, turnsTaken: 2.1, elapsedMs: 499.9 },
      { maxBudget: 10, maxTurns: 3, maxElapsedMs: 500 },
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.remainingBudget).toBe(1);
    expect(verdict.remainingTurns).toBe(1);
    expect(verdict.remainingElapsedMs).toBe(1);
  });
});
