import { describe, expect, it } from "vitest";
import { buildIssueAdvisory, buildPullRequestAdvisory, buildRepositoryAdvisory, formatCheckRunOutput } from "../../src/rules/advisory";
import type { IssueRecord, PullRequestRecord, RepositoryRecord } from "../../src/types";

const repo: RepositoryRecord = {
  fullName: "JSONbored/gittensory",
  owner: "JSONbored",
  name: "gittensory",
  isInstalled: true,
  isRegistered: true,
  isPrivate: true,
  registryConfig: {
    repo: "JSONbored/gittensory",
    emissionShare: 0.02,
    issueDiscoveryShare: 0,
    labelMultipliers: { feature: 1.5 },
    maintainerCut: 0,
    raw: {},
  },
};

describe("advisory rules", () => {
  it("flags missing linked issues on PR advisories", () => {
    const pr: PullRequestRecord = {
      repoFullName: repo.fullName,
      number: 12,
      title: "Add registry sync",
      state: "open",
      authorLogin: "oktofeesh1",
      authorAssociation: "NONE",
      headSha: "abc123",
      labels: ["feature"],
      linkedIssues: [],
    };

    const advisory = buildPullRequestAdvisory(repo, pr);

    expect(advisory.conclusion).toBe("neutral");
    expect(advisory.findings.map((finding) => finding.code)).toContain("missing_linked_issue");
    expect(formatCheckRunOutput(advisory).text).not.toMatch(/reward|farming/i);
  });

  it("marks unknown repositories as action required", () => {
    const advisory = buildRepositoryAdvisory(null, "owner/repo");
    expect(advisory.conclusion).toBe("action_required");
  });

  it("warns when an issue already has linked PRs", () => {
    const issue: IssueRecord = {
      repoFullName: repo.fullName,
      number: 4,
      title: "Improve check runs",
      state: "open",
      authorLogin: "maintainer",
      authorAssociation: "OWNER",
      labels: [],
      linkedPrs: [10],
    };

    const advisory = buildIssueAdvisory(repo, issue);
    expect(advisory.findings.map((finding) => finding.code)).toContain("issue_has_linked_prs");
  });

  it("flags duplicate risk when another open PR references the same linked issue", () => {
    const pr: PullRequestRecord = {
      repoFullName: repo.fullName,
      number: 12,
      title: "Add registry sync",
      state: "open",
      authorLogin: "oktofeesh1",
      authorAssociation: "NONE",
      headSha: "abc123",
      labels: [],
      linkedIssues: [4],
    };
    const otherPr: PullRequestRecord = {
      ...pr,
      number: 13,
      title: "Alternative registry sync",
      linkedIssues: [4],
    };

    const advisory = buildPullRequestAdvisory(repo, pr, { otherOpenPullRequests: [otherPr] });

    expect(advisory.findings.map((finding) => finding.code)).toContain("duplicate_pr_risk");
  });
});
