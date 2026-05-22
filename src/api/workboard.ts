import type { IssueRecord, RepositoryRecord } from "../types";

export type WorkboardItem = {
  repoFullName: string;
  issueNumber: number;
  title: string;
  state: string;
  htmlUrl?: string | null | undefined;
  fit: "good" | "caution" | "hold";
  reasons: string[];
};

export function buildWorkboard(repo: RepositoryRecord | null, issues: IssueRecord[]): WorkboardItem[] {
  if (!repo) return [];
  return issues.map((issue) => {
    const reasons: string[] = [];
    let fit: WorkboardItem["fit"] = "good";
    if (!repo.isRegistered) {
      fit = "hold";
      reasons.push("Repository is not present in the latest registry snapshot.");
    }
    if (issue.linkedPrs.length > 0) {
      fit = fit === "hold" ? "hold" : "caution";
      reasons.push("Issue already has linked pull requests.");
    }
    if (issue.authorAssociation && ["OWNER", "MEMBER", "COLLABORATOR"].includes(issue.authorAssociation)) {
      reasons.push("Issue was opened by a maintainer-associated account.");
    }
    if (reasons.length === 0) reasons.push("Open issue with no linked pull request detected by Gittensory.");
    return {
      repoFullName: repo.fullName,
      issueNumber: issue.number,
      title: issue.title,
      state: issue.state,
      htmlUrl: issue.htmlUrl,
      fit,
      reasons,
    };
  });
}
