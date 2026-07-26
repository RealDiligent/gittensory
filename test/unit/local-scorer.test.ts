import { describe, expect, it } from "vitest";
import { computeLocalScorerTokens } from "../../src/signals/local-scorer";
import { buildScorePreview } from "../../src/scoring/preview";
import type { ScoringModelSnapshotRecord } from "../../src/types";

// Minimal snapshot; every constant buildScorePreview reads falls back to DEFAULT_SCORING_CONSTANTS when absent,
// and the contribution bonus (clamp(total / FULL_BONUS) * MAX_BONUS) is a pure monotonic function of the total.
const bonusSnapshot: ScoringModelSnapshotRecord = {
  id: "local-scorer-parity",
  sourceKind: "test",
  sourceUrl: "fixture://local-scorer-parity",
  fetchedAt: "2026-07-01T00:00:00.000Z",
  activeModel: "current_density_model",
  constants: { CONTRIBUTION_SCORE_FOR_FULL_BONUS: 1500, MAX_CONTRIBUTION_BONUS: 25 },
  programmingLanguages: {},
  warnings: [],
  payload: {},
};

describe("computeLocalScorerTokens (#782)", () => {
  it("classifies source / test / non-code from metadata and sums additions + deletions", () => {
    const scorer = computeLocalScorerTokens({
      changedFiles: [
        { path: "src/foo.ts", additions: 10, deletions: 2 },
        { path: "src/foo.test.ts", additions: 8, deletions: 0 },
        { path: "README.md", additions: 5, deletions: 1 },
      ],
    });
    expect(scorer).toMatchObject({
      mode: "external_command",
      activeModel: "loopover-deterministic",
      sourceTokenScore: 12,
      testTokenScore: 8,
      nonCodeTokenScore: 6,
      totalTokenScore: 18.4, // 12 source + 0.05 * 8 test + 6 non-code (#8875 test-file weight)
      sourceLines: 12,
    });
    expect(scorer.warnings).toBeUndefined();
  });

  it("drops binary files; with no source, sourceLines falls back to total (matching buildScorePreview)", () => {
    const scorer = computeLocalScorerTokens({
      changedFiles: [
        { path: "img.png", additions: 100, binary: true },
        { path: "docs.md", additions: 3 },
      ],
    });
    expect(scorer.totalTokenScore).toBe(3); // the binary file carries no token value
    expect(scorer.sourceTokenScore).toBe(0);
    expect(scorer.nonCodeTokenScore).toBe(3);
    expect(scorer.sourceLines).toBe(3); // no source → falls back to total, floored at 1
  });

  it("floors sourceLines at 1 for a diff with no line counts at all", () => {
    const scorer = computeLocalScorerTokens({ changedFiles: [{ path: "docs.md" }] }); // additions/deletions omitted
    expect(scorer.totalTokenScore).toBe(0);
    expect(scorer.sourceLines).toBe(1);
  });

  it("counts generated Dart part files as non-code in deterministic metadata scoring", () => {
    const scorer = computeLocalScorerTokens({
      changedFiles: [
        { path: "lib/models/user.g.dart", additions: 4 },
        { path: "lib/models/user.freezed.dart", additions: 5 },
        { path: "lib/api/user.gr.dart", additions: 6 },
        { path: "lib/models/user.dart", additions: 3 },
      ],
    });
    expect(scorer.sourceTokenScore).toBe(3);
    expect(scorer.nonCodeTokenScore).toBe(15);
    expect(scorer.totalTokenScore).toBe(18);
  });

  it("surfaces a warning when local validation reports failures, without changing the scores", () => {
    const scorer = computeLocalScorerTokens({
      changedFiles: [{ path: "src/a.ts", additions: 4 }],
      validation: [
        { command: "npm test", status: "passed" },
        { command: "npm run typecheck", status: "failed" },
      ],
    });
    expect(scorer.sourceTokenScore).toBe(4);
    expect(scorer.warnings?.[0]).toMatch(/validation reported failures/i);
  });

  it("emits no warning when validation passed or was not supplied", () => {
    expect(computeLocalScorerTokens({ changedFiles: [{ path: "src/a.ts", additions: 1 }], validation: [{ command: "t", status: "passed" }] }).warnings).toBeUndefined();
    expect(computeLocalScorerTokens({ changedFiles: [{ path: "src/a.ts", additions: 1 }] }).warnings).toBeUndefined();
  });

  it("weights test lines in totalTokenScore so a fed-back total agrees with buildScorePreview's derivation (#8875)", () => {
    // A test-DOMINANT diff: 4 source lines, 200 test lines. The raw sum (204) previously flowed straight into
    // preview.ts as `localScorer` and was honoured as-is, skipping the 0.05x test-file discount preview applies
    // when it derives the total itself.
    const scorer = computeLocalScorerTokens({
      changedFiles: [
        { path: "src/tiny.ts", additions: 4 }, // source: 4
        { path: "src/huge.test.ts", additions: 200 }, // test: 200
      ],
    });
    expect(scorer.sourceTokenScore).toBe(4);
    expect(scorer.testTokenScore).toBe(200);
    expect(scorer.nonCodeTokenScore).toBe(0);
    expect(scorer.totalTokenScore).toBe(14); // 4 + 0.05 * 200, NOT the raw 204

    const components = {
      repoFullName: "owner/repo",
      sourceTokenScore: scorer.sourceTokenScore,
      testTokenScore: scorer.testTokenScore,
      nonCodeTokenScore: scorer.nonCodeTokenScore,
    };
    const suppliedTotal = buildScorePreview({ input: { ...components, totalTokenScore: scorer.totalTokenScore }, repo: null, snapshot: bonusSnapshot });
    const derivedTotal = buildScorePreview({ input: { ...components }, repo: null, snapshot: bonusSnapshot });
    // Feeding local-scorer's total back in now yields the SAME contribution bonus preview derives from the
    // components itself -- the two totals agree.
    expect(suppliedTotal.scoreEstimate.contributionBonus).toBe(derivedTotal.scoreEstimate.contributionBonus);

    // Non-vacuity: the bonus genuinely responds to the total, so the equality above is not trivially true.
    // The pre-fix raw 204 total inflates the bonus well above the derived 14-token one.
    const rawTotal = buildScorePreview({ input: { ...components, totalTokenScore: 204 }, repo: null, snapshot: bonusSnapshot });
    expect(rawTotal.scoreEstimate.contributionBonus).toBeGreaterThan(derivedTotal.scoreEstimate.contributionBonus);
  });
});
