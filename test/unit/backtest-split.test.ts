import { describe, expect, it } from "vitest";
import type { BacktestCase } from "../../packages/loopover-engine/src/calibration/backtest-corpus";
import { splitBacktestCorpus } from "../../packages/loopover-engine/src/calibration/backtest-split";

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

describe("splitBacktestCorpus (#8087) — deterministic seeded held-out split", () => {
  it("keeps every case visible at heldOutFraction 0", () => {
    const { visible, heldOut } = splitBacktestCorpus(CORPUS, 0, "seed-a");
    expect(visible).toHaveLength(CORPUS.length);
    expect(heldOut).toHaveLength(0);
  });

  it("holds every case out at heldOutFraction 1", () => {
    const { visible, heldOut } = splitBacktestCorpus(CORPUS, 1, "seed-a");
    expect(heldOut).toHaveLength(CORPUS.length);
    expect(visible).toHaveLength(0);
  });

  it("returns byte-identical output for the same cases, fraction, and seed — order included", () => {
    const first = splitBacktestCorpus(CORPUS, 0.5, "seed-a");
    const second = splitBacktestCorpus(CORPUS, 0.5, "seed-a");
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("assignment depends on content, not position: prepending a new case never reshuffles existing ones", () => {
    const before = splitBacktestCorpus(CORPUS, 0.5, "seed-a");
    const grown = [testCase("missing_linked_issue", "acme/widgets#new"), ...CORPUS];
    const after = splitBacktestCorpus(grown, 0.5, "seed-a");
    const bucketOf = (result: { visible: BacktestCase[]; heldOut: BacktestCase[] }, targetKey: string): string =>
      result.heldOut.some((item) => item.targetKey === targetKey) ? "heldOut" : "visible";
    for (const item of CORPUS) {
      expect(bucketOf(after, item.targetKey)).toBe(bucketOf(before, item.targetKey));
    }
  });

  it("a different seed produces a different split for at least one case", () => {
    const withSeedA = splitBacktestCorpus(CORPUS, 0.5, "seed-a");
    const withSeedB = splitBacktestCorpus(CORPUS, 0.5, "seed-b");
    expect(JSON.stringify(withSeedA)).not.toBe(JSON.stringify(withSeedB));
  });

  it("throws on an out-of-range fraction in both directions, naming the invalid value", () => {
    expect(() => splitBacktestCorpus(CORPUS, -0.1, "seed-a")).toThrow("-0.1");
    expect(() => splitBacktestCorpus(CORPUS, 1.5, "seed-a")).toThrow("1.5");
  });

  it("preserves each bucket's original relative order with both buckets populated", () => {
    const { visible, heldOut } = splitBacktestCorpus(CORPUS, 0.5, "seed-a");
    expect(visible.length).toBeGreaterThan(0);
    expect(heldOut.length).toBeGreaterThan(0);
    const indexOf = (item: BacktestCase): number => CORPUS.findIndex((candidate) => candidate.targetKey === item.targetKey);
    for (const bucket of [visible, heldOut]) {
      const positions = bucket.map(indexOf);
      expect(positions).toEqual([...positions].sort((left, right) => left - right));
    }
  });
});
