import { describe, expect, it, vi } from "vitest";
import { auditPullRequestAutoReviewSkip } from "../../src/queue/processors";
import { parseFocusManifest, resolvePullRequestAutoReviewSkipReason } from "../../src/signals/focus-manifest";
import * as repositoriesModule from "../../src/db/repositories";

describe("review.auto_review wiring (#1954)", () => {
  it("resolvePullRequestAutoReviewSkipReason: forceAiReview bypasses every filter", () => {
    const manifest = parseFocusManifest({ review: { auto_review: { skip_drafts: true } } });
    expect(
      resolvePullRequestAutoReviewSkipReason({
        forceAiReview: true,
        manifest,
        isDraft: true,
        author: "dependabot[bot]",
        title: "WIP: bump",
        baseRef: "develop",
      }),
    ).toBeNull();
  });

  it("resolvePullRequestAutoReviewSkipReason: matches the documented *[bot] author glob", () => {
    const manifest = parseFocusManifest({ review: { auto_review: { ignore_authors: ["*[bot]"] } } });
    expect(
      resolvePullRequestAutoReviewSkipReason({
        manifest,
        isDraft: false,
        author: "dependabot[bot]",
        title: "chore: bump deps",
        baseRef: "main",
      }),
    ).toBe("review skipped (ignored author)");
  });

  it("auditPullRequestAutoReviewSkip records the skip reason and is fail-safe on audit errors", async () => {
    const auditSpy = vi.spyOn(repositoriesModule, "recordAuditEvent").mockResolvedValue(undefined);
    await auditPullRequestAutoReviewSkip({} as Env, {
      actor: "dependabot[bot]",
      repoFullName: "acme/widgets",
      pullNumber: 7,
      deliveryId: "delivery-1",
      headSha: "abc123",
      skipReason: "review skipped (ignored author)",
    });
    expect(auditSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: "github_app.ai_review_auto_review_skipped",
        detail: "review skipped (ignored author)",
        targetKey: "acme/widgets#7",
      }),
    );

    auditSpy.mockRejectedValueOnce(new Error("audit DB down"));
    await expect(
      auditPullRequestAutoReviewSkip({} as Env, {
        actor: "bot",
        repoFullName: "acme/widgets",
        pullNumber: 8,
        deliveryId: "delivery-2",
        headSha: null,
        skipReason: "review skipped (draft)",
      }),
    ).resolves.toBeUndefined();
    auditSpy.mockRestore();
  });
});
