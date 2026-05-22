import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  getIssue,
  getPullRequest,
  getRepository,
  listOtherOpenPullRequests,
  listOpenIssues,
  listRepositories,
  persistAdvisory,
} from "../db/repositories";
import { handleGitHubWebhook } from "../github/webhook";
import { buildOpenApiSpec } from "../openapi/spec";
import { getLatestRegistrySnapshot, refreshRegistry } from "../registry/sync";
import { buildIssueAdvisory, buildPullRequestAdvisory, buildRepositoryAdvisory } from "../rules/advisory";
import type { JobMessage } from "../types";
import { nowIso } from "../utils/json";
import { buildWorkboard } from "./workboard";

type AppBindings = { Bindings: Env };

export function createApp() {
  const app = new Hono<AppBindings>();
  app.use("*", cors());

  app.get("/health", (c) => c.json({ status: "ok", service: "gittensory-api", time: nowIso() }));
  app.get("/openapi.json", (c) => c.json(buildOpenApiSpec()));

  app.get("/v1/registry/snapshot", async (c) => {
    const snapshot = await getLatestRegistrySnapshot(c.env);
    if (!snapshot) return c.json({ error: "registry_snapshot_not_found" }, 404);
    return c.json(snapshot);
  });

  app.get("/v1/repos", async (c) => c.json(await listRepositories(c.env)));

  app.get("/v1/repos/:owner/:repo", async (c) => {
    const repo = await getRepository(c.env, `${c.req.param("owner")}/${c.req.param("repo")}`);
    if (!repo) return c.json({ error: "repo_not_found" }, 404);
    return c.json(repo);
  });

  app.get("/v1/repos/:owner/:repo/advisory", async (c) => {
    const fullName = `${c.req.param("owner")}/${c.req.param("repo")}`;
    const repo = await getRepository(c.env, fullName);
    const advisory = buildRepositoryAdvisory(repo, fullName);
    await persistAdvisory(c.env, advisory);
    return c.json(advisory);
  });

  app.get("/v1/repos/:owner/:repo/workboard", async (c) => {
    const fullName = `${c.req.param("owner")}/${c.req.param("repo")}`;
    const repo = await getRepository(c.env, fullName);
    const issues = await listOpenIssues(c.env, fullName);
    return c.json(buildWorkboard(repo, issues));
  });

  app.get("/v1/repos/:owner/:repo/pulls/:number/advisory", async (c) => {
    const fullName = `${c.req.param("owner")}/${c.req.param("repo")}`;
    const number = Number(c.req.param("number"));
    const repo = await getRepository(c.env, fullName);
    const pr = Number.isFinite(number) ? await getPullRequest(c.env, fullName, number) : null;
    const otherOpenPullRequests = Number.isFinite(number) ? await listOtherOpenPullRequests(c.env, fullName, number) : [];
    const advisory = buildPullRequestAdvisory(repo, pr, { otherOpenPullRequests });
    await persistAdvisory(c.env, advisory);
    return c.json(advisory);
  });

  app.get("/v1/repos/:owner/:repo/issues/:number/advisory", async (c) => {
    const fullName = `${c.req.param("owner")}/${c.req.param("repo")}`;
    const number = Number(c.req.param("number"));
    const repo = await getRepository(c.env, fullName);
    const issue = Number.isFinite(number) ? await getIssue(c.env, fullName, number) : null;
    const advisory = buildIssueAdvisory(repo, issue);
    await persistAdvisory(c.env, advisory);
    return c.json(advisory);
  });

  app.post("/v1/github/webhook", handleGitHubWebhook);

  app.post("/v1/internal/jobs/refresh-registry", async (c) => {
    const token = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || token !== c.env.INTERNAL_JOB_TOKEN) return c.json({ error: "unauthorized" }, 401);
    const message: JobMessage = { type: "refresh-registry", requestedBy: "api" };
    await c.env.JOBS.send(message);
    return c.json({ ok: true, status: "queued" }, 202);
  });

  app.post("/v1/internal/jobs/refresh-registry/run", async (c) => {
    const token = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || token !== c.env.INTERNAL_JOB_TOKEN) return c.json({ error: "unauthorized" }, 401);
    return c.json(await refreshRegistry(c.env));
  });

  return app;
}
