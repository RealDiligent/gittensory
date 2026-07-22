import assert from "node:assert/strict";
import { test } from "node:test";

import { buildBacktestCorpus, type BacktestCase, type HumanOverrideEvent, type RuleFiredEvent } from "../dist/index.js";

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

test("barrel: the public entrypoint re-exports the backtest-corpus builder (#8083)", () => {
  assert.equal(typeof buildBacktestCorpus, "function");
});

test("buildBacktestCorpus: empty inputs produce an empty corpus", () => {
  assert.deepEqual(buildBacktestCorpus("missing_linked_issue", [], []), []);
});

test("buildBacktestCorpus: a fired event with no matching override is excluded, not emitted unlabeled", () => {
  const corpus = buildBacktestCorpus("missing_linked_issue", [fired("missing_linked_issue", "a#1")], []);
  assert.deepEqual(corpus, []);
});

test("buildBacktestCorpus: a single fired+override pair produces one correctly-labeled case", () => {
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
  assert.deepEqual(corpus, expected);
});

test("buildBacktestCorpus: omits the metadata key entirely when the fired event carries none", () => {
  const [item] = buildBacktestCorpus(
    "missing_linked_issue",
    [fired("missing_linked_issue", "a#1")],
    [override("missing_linked_issue", "a#1", "confirmed")],
  );
  assert.ok(item);
  assert.equal(item.label, "confirmed");
  assert.equal(Object.hasOwn(item, "metadata"), false);
});

test("buildBacktestCorpus: multiple overrides pair each firing with the nearest strictly-following verdict", () => {
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
  assert.equal(corpus.length, 2);
  assert.deepEqual(
    corpus.map((item) => [item.firedAt, item.label, item.decidedAt]),
    [
      ["2026-07-22T00:00:00.000Z", "reversed", "2026-07-22T02:00:00.000Z"],
      ["2026-07-22T04:00:00.000Z", "confirmed", "2026-07-22T06:00:00.000Z"],
    ],
  );
});

test("buildBacktestCorpus: with no strictly-following override, the most recent one stands in", () => {
  const corpus = buildBacktestCorpus(
    "rule",
    [fired("rule", "a#1", { occurredAt: "2026-07-22T10:00:00.000Z" })],
    [
      override("rule", "a#1", "reversed", { occurredAt: "2026-07-22T01:00:00.000Z" }),
      override("rule", "a#1", "confirmed", { occurredAt: "2026-07-22T05:00:00.000Z" }),
    ],
  );
  assert.equal(corpus.length, 1);
  assert.equal(corpus[0]?.label, "confirmed");
  assert.equal(corpus[0]?.decidedAt, "2026-07-22T05:00:00.000Z");
});

test("buildBacktestCorpus: fired and override events for a DIFFERENT ruleId are ignored entirely", () => {
  const corpus = buildBacktestCorpus(
    "rule",
    [fired("other_rule", "a#1"), fired("rule", "a#2")],
    [override("rule", "a#1", "confirmed"), override("other_rule", "a#2", "confirmed"), override("rule", "a#2", "reversed")],
  );
  assert.equal(corpus.length, 1);
  assert.equal(corpus[0]?.targetKey, "a#2");
  assert.equal(corpus[0]?.label, "reversed");
});
