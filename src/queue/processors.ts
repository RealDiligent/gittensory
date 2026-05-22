import {
  getRepository,
  listOtherOpenPullRequests,
  markInstallationDeleted,
  persistAdvisory,
  recordWebhookEvent,
  upsertInstallation,
  upsertIssueFromGitHub,
  upsertPullRequestFromGitHub,
  upsertRepositoryFromGitHub,
} from "../db/repositories";
import { createOrUpdateCheckRun, getInstallationId } from "../github/app";
import { refreshRegistry } from "../registry/sync";
import { buildIssueAdvisory, buildPullRequestAdvisory } from "../rules/advisory";
import type { GitHubWebhookPayload, JobMessage } from "../types";

export async function processJob(env: Env, message: JobMessage): Promise<void> {
  switch (message.type) {
    case "refresh-registry":
      await refreshRegistry(env);
      return;
    case "github-webhook":
      await processGitHubWebhook(env, message.deliveryId, message.eventName, message.payload);
      return;
  }
}

async function processGitHubWebhook(env: Env, deliveryId: string, eventName: string, payload: GitHubWebhookPayload): Promise<void> {
  try {
    if (eventName === "installation" && payload.action === "deleted" && payload.installation?.id) {
      await markInstallationDeleted(env, payload.installation.id);
      await recordWebhookEvent(env, {
        deliveryId,
        eventName,
        action: payload.action,
        installationId: payload.installation.id,
        repositoryFullName: payload.repository?.full_name,
        payloadHash: "processed",
        status: "processed",
      });
      return;
    }

    await upsertInstallation(env, payload);

    const installationId = getInstallationId(payload);
    if (payload.repositories) {
      for (const repo of payload.repositories) await upsertRepositoryFromGitHub(env, repo, installationId ?? undefined);
    }
    if (payload.repository) await upsertRepositoryFromGitHub(env, payload.repository, installationId ?? undefined);

    if (payload.repository?.full_name && payload.pull_request) {
      const pr = await upsertPullRequestFromGitHub(env, payload.repository.full_name, payload.pull_request);
      const repo = await getRepository(env, payload.repository.full_name);
      const otherOpenPullRequests = await listOtherOpenPullRequests(env, payload.repository.full_name, pr.number);
      const advisory = buildPullRequestAdvisory(repo, pr, { otherOpenPullRequests });
      await persistAdvisory(env, advisory);
      if (installationId && advisory.headSha) await createOrUpdateCheckRun(env, installationId, payload.repository.full_name, advisory);
    }

    if (payload.repository?.full_name && payload.issue && !payload.issue.pull_request) {
      const issue = await upsertIssueFromGitHub(env, payload.repository.full_name, payload.issue);
      const repo = await getRepository(env, payload.repository.full_name);
      const advisory = buildIssueAdvisory(repo, issue);
      await persistAdvisory(env, advisory);
    }

    await recordWebhookEvent(env, {
      deliveryId,
      eventName,
      action: payload.action,
      installationId: payload.installation?.id,
      repositoryFullName: payload.repository?.full_name,
      payloadHash: "processed",
      status: "processed",
    });
  } catch (error) {
    await recordWebhookEvent(env, {
      deliveryId,
      eventName,
      action: payload.action,
      installationId: payload.installation?.id,
      repositoryFullName: payload.repository?.full_name,
      payloadHash: "processed",
      status: "error",
      errorSummary: error instanceof Error ? error.message : "unknown error",
    });
    throw error;
  }
}
