import assert from "node:assert/strict";
import { test } from "node:test";

import { splitBacktestCorpus } from "../dist/calibration/backtest-split.js";
import type { BacktestCase } from "../dist/index.js";

function testCase(ruleId: string, targetKey: string): BacktestCase {
  return {
    ruleId,
    targetKey,
    outcome: "block",
    label: "confirmed",
    firedAt: "2026-07-22T00:00:00.000Z",
    decidedAt: "2026-07-22T01:00:00.000Z",
  };
}

const CORPUS: BacktestCase[] = Array.from({ length: 12 }, (_, index) => testCase("missing_linked_issue", `acme/widgets#${index + 1}`));

test("splitBacktestCorpus: heldOutFraction 0 keeps every case visible", () => {
  const { visible, heldOut } = splitBacktestCorpus(CORPUS, 0, "seed-a");
  assert.equal(visible.length, CORPUS.length);
  assert.equal(heldOut.length, 0);
});

test("splitBacktestCorpus: heldOutFraction 1 holds every case out", () => {
  const { visible, heldOut } = splitBacktestCorpus(CORPUS, 1, "seed-a");
  assert.equal(heldOut.length, CORPUS.length);
  assert.equal(visible.length, 0);
});

test("splitBacktestCorpus: same cases + fraction + seed twice -> byte-identical output, order included", () => {
  const first = splitBacktestCorpus(CORPUS, 0.5, "seed-a");
  const second = splitBacktestCorpus(CORPUS, 0.5, "seed-a");
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("splitBacktestCorpus: a different seed produces a different split for at least one case", () => {
  const withSeedA = splitBacktestCorpus(CORPUS, 0.5, "seed-a");
  const withSeedB = splitBacktestCorpus(CORPUS, 0.5, "seed-b");
  assert.notEqual(JSON.stringify(withSeedA), JSON.stringify(withSeedB));
});

test("splitBacktestCorpus: throws on an out-of-range fraction, in both directions, naming the value", () => {
  assert.throws(() => splitBacktestCorpus(CORPUS, -0.1, "seed-a"), /-0\.1/);
  assert.throws(() => splitBacktestCorpus(CORPUS, 1.5, "seed-a"), /1\.5/);
});

test("splitBacktestCorpus: each bucket preserves the cases' original relative order", () => {
  const { visible, heldOut } = splitBacktestCorpus(CORPUS, 0.5, "seed-a");
  assert.ok(visible.length > 0 && heldOut.length > 0, "fixture must land cases in both buckets");
  const indexOf = (item: BacktestCase): number => CORPUS.findIndex((candidate) => candidate.targetKey === item.targetKey);
  for (const bucket of [visible, heldOut]) {
    const positions = bucket.map(indexOf);
    assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  }
});
