// Deterministic seeded visible/held-out split of the backtest corpus (#8087, part of the #8082
// rule-precision backtest epic). Evaluating a candidate rule against a visible set AND an undisclosed
// held-out set (taking the worse of the two) prevents a rule fix from being hand-tuned to just the
// incidents already known about. The partition hashes each case's CONTENT -- (seed, ruleId, targetKey) --
// never its position or the corpus size, so a corpus that grows over time doesn't reshuffle which
// already-processed cases were previously held out.
//
// SELF-CONTAINED, PURE: no IO, no Math.random(), no wall-clock reads -- the same posture as the rest of
// this calibration directory. Hashing reuses the exact sha256 approach deny-hook-synthesis.ts's
// stableProposalId already uses in this package (createHash("sha256").update(...).digest("hex")).

import { createHash } from "node:crypto";
import type { BacktestCase } from "./backtest-corpus.js";

/**
 * Partition `cases` into a visible slice and a held-out slice, deterministically for a fixed `seed`.
 * Each case hashes `${seed}:${ruleId}:${targetKey}` (sha256), takes the first 8 hex characters as a
 * base-16 integer, and divides by 0xffffffff for a value in [0, 1); the case is held out when that value
 * is strictly below `heldOutFraction`. Assignment depends only on (seed, ruleId, targetKey) -- never on
 * input position or corpus length -- and each bucket preserves the cases' original relative order (no
 * sorting, no shuffling), so the same inputs always produce byte-identical output. Throws when
 * `heldOutFraction` is outside the inclusive [0, 1] range.
 */
export function splitBacktestCorpus(
  cases: readonly BacktestCase[],
  heldOutFraction: number,
  seed: string,
): { visible: BacktestCase[]; heldOut: BacktestCase[] } {
  if (!(heldOutFraction >= 0 && heldOutFraction <= 1)) {
    throw new Error(`splitBacktestCorpus: heldOutFraction must be within [0, 1], got ${heldOutFraction}`);
  }
  const visible: BacktestCase[] = [];
  const heldOut: BacktestCase[] = [];
  for (const item of cases) {
    const digest = createHash("sha256").update(`${seed}:${item.ruleId}:${item.targetKey}`).digest("hex");
    const value = parseInt(digest.slice(0, 8), 16) / 0xffffffff;
    if (value < heldOutFraction) heldOut.push(item);
    else visible.push(item);
  }
  return { visible, heldOut };
}
