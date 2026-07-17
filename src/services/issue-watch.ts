import {
  deleteIssueWatchSubscription,
  listIssueWatchSubscriptionsForLogin,
  upsertIssueWatchSubscription,
} from "../db/repositories";

/** One issue-watch subscription row, as returned by MCP/REST/CLI. */
export type ContributorWatchEntry = {
  repoFullName: string;
  labels: string[];
};

/** Shared payload for list/watch/unwatch (#6746). */
export type ContributorWatchesResult = {
  login: string;
  watching: ContributorWatchEntry[];
  summary: string;
  changed?: string;
};

function watchingSummary(count: number, changed?: string): string {
  return `Watching ${count} repo(s) for new grabbable issues${changed ? ` (${changed})` : ""}.`;
}

async function loadWatching(env: Env, login: string): Promise<ContributorWatchEntry[]> {
  return (await listIssueWatchSubscriptionsForLogin(env, login)).map((sub) => ({
    repoFullName: sub.repoFullName,
    labels: sub.labels,
  }));
}

/** List a contributor's issue-watch subscriptions. */
export async function listContributorWatches(env: Env, login: string): Promise<ContributorWatchesResult> {
  const watching = await loadWatching(env, login);
  return {
    login: login.toLowerCase(),
    watching,
    summary: watchingSummary(watching.length),
  };
}

/**
 * Subscribe `login` to new grabbable issues on `repoFullName`.
 * Callers that use a session identity must gate with `canWatchRepo` first (REST/MCP).
 */
export async function watchContributorRepo(
  env: Env,
  login: string,
  repoFullName: string,
  labels?: string[],
): Promise<ContributorWatchesResult> {
  await upsertIssueWatchSubscription(env, { login, repoFullName, labels });
  const changed = `watching ${repoFullName}${labels && labels.length > 0 ? ` (labels: ${labels.join(", ")})` : ""}`;
  const watching = await loadWatching(env, login);
  return {
    login: login.toLowerCase(),
    watching,
    summary: watchingSummary(watching.length, changed),
    changed,
  };
}

/**
 * Remove an issue-watch subscription. Callers that use a session identity must gate with
 * `canWatchRepo` first (same as MCP `requireWatchableRepo`).
 */
export async function unwatchContributorRepo(env: Env, login: string, repoFullName: string): Promise<ContributorWatchesResult> {
  const removed = await deleteIssueWatchSubscription(env, login, repoFullName);
  const changed = removed ? `unwatched ${repoFullName}` : `was not watching ${repoFullName}`;
  const watching = await loadWatching(env, login);
  return {
    login: login.toLowerCase(),
    watching,
    summary: watchingSummary(watching.length, changed),
    changed,
  };
}

export type ManageContributorWatchesInput = {
  login: string;
  action: "list" | "watch" | "unwatch";
  repoFullName?: string | undefined;
  labels?: string[] | undefined;
};

/**
 * Orchestrator used by MCP (and available to REST). Does not enforce `canWatchRepo` —
 * session callers must check that before watch/unwatch.
 * Returns `{ missingRepo: true, summary }` when watch/unwatch omit repoFullName.
 */
export async function manageContributorWatches(
  env: Env,
  input: ManageContributorWatchesInput,
): Promise<ContributorWatchesResult | { missingRepo: true; summary: string }> {
  if (input.action === "watch" || input.action === "unwatch") {
    if (!input.repoFullName) {
      return { missingRepo: true, summary: `${input.action} requires repoFullName.` };
    }
    if (input.action === "watch") {
      return watchContributorRepo(env, input.login, input.repoFullName, input.labels);
    }
    return unwatchContributorRepo(env, input.login, input.repoFullName);
  }
  return listContributorWatches(env, input.login);
}
