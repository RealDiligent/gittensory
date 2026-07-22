import { describe, expect, it } from "vitest";
import {
  buildBacktestCorpus,
  type BacktestCase,
} from "../../packages/loopover-engine/src/calibration/backtest-corpus";
import type { HumanOverrideEvent, RuleFiredEvent } from "../../packages/loopover-engine/src/calibration/signal-tracking";

function fired(ruleId: string, targetKey: string, overrides: Partial<RuleFiredEvent> = {}): RuleFiredEvent {
  return { ruleId, targetKey, outcome: "block", occurredAt: "2026-07-22T00:00:00.000Z", ...overrides };
}

function override(
  ruleId: string,
  targetKey: string,
  verdict: HumanOverrideEvent["verdict"],
  overrides: Partial<HumanOverrideEvent> = {},
): HumanOverrideEvent {
  return { ruleId, targetKey, verdict, occurredAt: "2026-07-22T01:00:00.000Z", ...overrides };
}

describe("buildBacktestCorpus (#8083) — pure labeled-corpus builder", () => {
  it("produces an empty corpus from empty inputs", () => {
    expect(buildBacktestCorpus("missing_linked_issue", [], [])).toEqual([]);
  });

  it("excludes a fired event with no matching override instead of emitting an unlabeled case", () => {
    expect(buildBacktestCorpus("missing_linked_issue", [fired("missing_linked_issue", "a#1")], [])).toEqual([]);
  });

  it("pairs a single fired+override into one correctly-labeled case, carrying outcome and metadata", () => {
    const corpus = buildBacktestCorpus(
      "missing_linked_issue",
      [fired("missing_linked_issue", "a#1", { outcome: "closed", metadata: { pr: 1 } })],
      [override("missing_linked_issue", "a#1", "reversed")],
    );
    const expected: BacktestCase[] = [
      {
        ruleId: "missing_linked_issue",
        targetKey: "a#1",
        outcome: "closed",
        label: "reversed",
        firedAt: "2026-07-22T00:00:00.000Z",
        decidedAt: "2026-07-22T01:00:00.000Z",
        metadata: { pr: 1 },
      },
    ];
    expect(corpus).toEqual(expected);
  });

  it("omits the metadata key entirely (not undefined) when the fired event has none", () => {
    const [item] = buildBacktestCorpus(
      "missing_linked_issue",
      [fired("missing_linked_issue", "a#1")],
      [override("missing_linked_issue", "a#1", "confirmed")],
    );
    expect(item?.label).toBe("confirmed");
    expect(Object.hasOwn(item ?? {}, "metadata")).toBe(false);
  });

  it("pairs each firing with the NEAREST strictly-following override when a target was re-fired and re-judged", () => {
    // Candidate scan order deliberately puts the farther-after verdict first, so the nearer one must
    // replace it, and a third even-farther verdict must NOT displace the nearest already found.
    const corpus = buildBacktestCorpus(
      "rule",
      [fired("rule", "a#1", { occurredAt: "2026-07-22T00:00:00.000Z" })],
      [
        override("rule", "a#1", "reversed", { occurredAt: "2026-07-22T06:00:00.000Z" }),
        override("rule", "a#1", "confirmed", { occurredAt: "2026-07-22T02:00:00.000Z" }),
        override("rule", "a#1", "reversed", { occurredAt: "2026-07-22T08:00:00.000Z" }),
      ],
    );
    expect(corpus).toHaveLength(1);
    expect(corpus[0]?.label).toBe("confirmed");
    expect(corpus[0]?.decidedAt).toBe("2026-07-22T02:00:00.000Z");
  });

  it("re-fired targets each get their own case, never a duplicate for the same fired event", () => {
    const corpus = buildBacktestCorpus(
      "rule",
      [
        fired("rule", "a#1", { occurredAt: "2026-07-22T00:00:00.000Z" }),
        fired("rule", "a#1", { occurredAt: "2026-07-22T04:00:00.000Z" }),
      ],
      [
        override("rule", "a#1", "reversed", { occurredAt: "2026-07-22T02:00:00.000Z" }),
        override("rule", "a#1", "confirmed", { occurredAt: "2026-07-22T06:00:00.000Z" }),
      ],
    );
    expect(corpus.map((item) => [item.firedAt, item.label])).toEqual([
      ["2026-07-22T00:00:00.000Z", "reversed"],
      ["2026-07-22T04:00:00.000Z", "confirmed"],
    ]);
  });

  it("falls back to the most recent override when none strictly follows the firing", () => {
    // Scan order is ascending here, so the later verdict must replace the earlier as most-recent.
    const corpus = buildBacktestCorpus(
      "rule",
      [fired("rule", "a#1", { occurredAt: "2026-07-22T10:00:00.000Z" })],
      [
        override("rule", "a#1", "reversed", { occurredAt: "2026-07-22T01:00:00.000Z" }),
        override("rule", "a#1", "confirmed", { occurredAt: "2026-07-22T05:00:00.000Z" }),
      ],
    );
    expect(corpus).toHaveLength(1);
    expect(corpus[0]?.label).toBe("confirmed");
    expect(corpus[0]?.decidedAt).toBe("2026-07-22T05:00:00.000Z");
  });

  it("ignores fired and override events for a different ruleId, and overrides for a different target", () => {
    const corpus = buildBacktestCorpus(
      "rule",
      [fired("other_rule", "a#1"), fired("rule", "a#2")],
      [
        override("rule", "a#1", "confirmed"), // right rule, wrong target -- never pairs with a#2
        override("other_rule", "a#2", "confirmed"), // wrong rule, right target -- filtered out
        override("rule", "a#2", "reversed"),
      ],
    );
    expect(corpus).toHaveLength(1);
    expect(corpus[0]?.targetKey).toBe("a#2");
    expect(corpus[0]?.label).toBe("reversed");
  });
});
