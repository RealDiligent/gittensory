import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/routes";
import { createSessionForGitHubUser } from "../../src/auth/security";
import { upsertIssueWatchSubscription, upsertRepositoryFromGitHub } from "../../src/db/repositories";
import { LoopoverMcp } from "../../src/mcp/server";
import { createTestEnv } from "../helpers/d1";

// #6746: GET/POST/DELETE /v1/contributors/:login/watches — REST mirrors of loopover_watch_issues.
const apiHeaders = (env: Env) => ({ authorization: `Bearer ${env.LOOPOVER_API_TOKEN}` });
const jsonHeaders = (env: Env) => ({ authorization: `Bearer ${env.LOOPOVER_API_TOKEN}`, "content-type": "application/json" });

async function connectMcp(env: Env) {
  const server = new LoopoverMcp(env).createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "watches-parity-test", version: "0.0.1" }, { capabilities: {} });
  await client.connect(clientTransport);
  return client;
}

describe("GET /v1/contributors/:login/watches (#6746)", () => {
  it("lists the contributor's watches with a summary", async () => {
    const app = createApp();
    const env = createTestEnv();
    await upsertIssueWatchSubscription(env, { login: "miner1", repoFullName: "acme/widgets", labels: ["bug"] });

    const response = await app.request("/v1/contributors/Miner1/watches", { headers: apiHeaders(env) }, env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      login: "miner1",
      watching: [{ repoFullName: "acme/widgets", labels: ["bug"] }],
      summary: "Watching 1 repo(s) for new grabbable issues.",
    });
  });

  it("returns an empty watching list when there are no subscriptions", async () => {
    const app = createApp();
    const env = createTestEnv();
    const response = await app.request("/v1/contributors/miner1/watches", { headers: apiHeaders(env) }, env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      login: "miner1",
      watching: [],
      summary: "Watching 0 repo(s) for new grabbable issues.",
    });
  });

  it("rejects an unauthenticated caller", async () => {
    const app = createApp();
    const env = createTestEnv();
    const response = await app.request("/v1/contributors/miner1/watches", {}, env);
    expect(response.status).toBeGreaterThanOrEqual(401);
    expect(response.status).toBeLessThan(404);
  });

  it("403s the shared mcp token unless fully unscoped (#2455 parity with the MCP surface)", async () => {
    const app = createApp();
    const env = createTestEnv({ MCP_READ_REPO_ALLOWLIST: "acme/widgets" });
    const response = await app.request("/v1/contributors/miner1/watches", { headers: { authorization: `Bearer ${env.LOOPOVER_MCP_TOKEN}` } }, env);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden_contributor" });
  });

  it("returns the same payload the loopover_watch_issues MCP tool returns for action=list (mirror parity)", async () => {
    const app = createApp();
    const env = createTestEnv();
    await upsertIssueWatchSubscription(env, { login: "miner1", repoFullName: "acme/widgets", labels: ["bug"] });
    const restBody = await (await app.request("/v1/contributors/miner1/watches", { headers: apiHeaders(env) }, env)).json();
    const client = await connectMcp(env);
    const viaTool = await client.callTool({ name: "loopover_watch_issues", arguments: { login: "miner1", action: "list" } });
    expect((viaTool as { structuredContent?: unknown }).structuredContent).toEqual(restBody);
  });
});

describe("POST /v1/contributors/:login/watches (#6746)", () => {
  it("watches a repo and returns the updated list with changed", async () => {
    const app = createApp();
    const env = createTestEnv();
    const response = await app.request(
      "/v1/contributors/miner1/watches",
      { method: "POST", headers: jsonHeaders(env), body: JSON.stringify({ repoFullName: "acme/widgets", labels: ["bug"] }) },
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      login: "miner1",
      watching: [{ repoFullName: "acme/widgets", labels: ["bug"] }],
      summary: "Watching 1 repo(s) for new grabbable issues (watching acme/widgets (labels: bug)).",
      changed: "watching acme/widgets (labels: bug)",
    });
  });

  it("rejects a malformed body with 400", async () => {
    const app = createApp();
    const env = createTestEnv();
    const bodies = [{}, { repoFullName: "ab" }, { repoFullName: "acme/widgets", labels: [""] }, { repoFullName: 1 }];
    for (const body of bodies) {
      const response = await app.request(
        "/v1/contributors/miner1/watches",
        { method: "POST", headers: jsonHeaders(env), body: JSON.stringify(body) },
        env,
      );
      expect(response.status, JSON.stringify(body)).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "invalid_watch" });
    }
  });

  it("403s a session that cannot watch a private inaccessible repo", async () => {
    const app = createApp();
    const env = createTestEnv();
    await upsertRepositoryFromGitHub(env, { name: "private", full_name: "victim/private", private: true, owner: { login: "victim" }, default_branch: "main" }, 321);
    const { token } = await createSessionForGitHubUser(env, { login: "miner1", id: 1 });
    const response = await app.request(
      "/v1/contributors/miner1/watches",
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ repoFullName: "victim/private" }),
      },
      env,
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden_watch_repo" });
  });

  it("lets a session watch a tracked public repo", async () => {
    const app = createApp();
    const env = createTestEnv();
    await upsertRepositoryFromGitHub(env, { name: "repo", full_name: "owner/repo", private: false, owner: { login: "owner" }, default_branch: "main" }, 100);
    const { token } = await createSessionForGitHubUser(env, { login: "miner1", id: 1 });
    const response = await app.request(
      "/v1/contributors/miner1/watches",
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ repoFullName: "owner/repo" }),
      },
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      login: "miner1",
      watching: [{ repoFullName: "owner/repo", labels: [] }],
      changed: "watching owner/repo",
    });
  });

  it("returns the same payload the MCP tool returns for action=watch (mirror parity)", async () => {
    const restEnv = createTestEnv();
    const app = createApp();
    const restBody = await (
      await app.request(
        "/v1/contributors/miner1/watches",
        { method: "POST", headers: jsonHeaders(restEnv), body: JSON.stringify({ repoFullName: "acme/widgets", labels: ["bug"] }) },
        restEnv,
      )
    ).json();

    const toolEnv = createTestEnv();
    const client = await connectMcp(toolEnv);
    const viaTool = await client.callTool({
      name: "loopover_watch_issues",
      arguments: { login: "miner1", action: "watch", repoFullName: "acme/widgets", labels: ["bug"] },
    });
    expect((viaTool as { structuredContent?: unknown }).structuredContent).toEqual(restBody);
  });
});

describe("DELETE /v1/contributors/:login/watches (#6746)", () => {
  it("unwatches via ?repoFullName= and reports changed", async () => {
    const app = createApp();
    const env = createTestEnv();
    await upsertIssueWatchSubscription(env, { login: "miner1", repoFullName: "acme/widgets" });
    const response = await app.request("/v1/contributors/miner1/watches?repoFullName=acme%2Fwidgets", { method: "DELETE", headers: apiHeaders(env) }, env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      login: "miner1",
      watching: [],
      summary: "Watching 0 repo(s) for new grabbable issues (unwatched acme/widgets).",
      changed: "unwatched acme/widgets",
    });
  });

  it("reports was-not-watching when the subscription is already gone", async () => {
    const app = createApp();
    const env = createTestEnv();
    const response = await app.request("/v1/contributors/miner1/watches?repoFullName=acme%2Fwidgets", { method: "DELETE", headers: apiHeaders(env) }, env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      login: "miner1",
      watching: [],
      changed: "was not watching acme/widgets",
    });
  });

  it("rejects a missing or too-short repoFullName query with 400", async () => {
    const app = createApp();
    const env = createTestEnv();
    for (const url of ["/v1/contributors/miner1/watches", "/v1/contributors/miner1/watches?repoFullName=ab"]) {
      const response = await app.request(url, { method: "DELETE", headers: apiHeaders(env) }, env);
      expect(response.status, url).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "invalid_unwatch" });
    }
  });

  it("403s a session that cannot unwatch an inaccessible private repo", async () => {
    const app = createApp();
    const env = createTestEnv();
    await upsertRepositoryFromGitHub(env, { name: "private", full_name: "victim/private", private: true, owner: { login: "victim" }, default_branch: "main" }, 321);
    const { token } = await createSessionForGitHubUser(env, { login: "miner1", id: 1 });
    const response = await app.request("/v1/contributors/miner1/watches?repoFullName=victim%2Fprivate", {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    }, env);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden_watch_repo" });
  });

  it("lets a session unwatch a tracked public repo", async () => {
    const app = createApp();
    const env = createTestEnv();
    await upsertRepositoryFromGitHub(env, { name: "repo", full_name: "owner/repo", private: false, owner: { login: "owner" }, default_branch: "main" }, 100);
    await upsertIssueWatchSubscription(env, { login: "miner1", repoFullName: "owner/repo" });
    const { token } = await createSessionForGitHubUser(env, { login: "miner1", id: 1 });
    const response = await app.request("/v1/contributors/miner1/watches?repoFullName=owner%2Frepo", {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    }, env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      login: "miner1",
      watching: [],
      changed: "unwatched owner/repo",
    });
  });

  it("returns the same payload the MCP tool returns for action=unwatch (mirror parity)", async () => {
    const restEnv = createTestEnv();
    await upsertIssueWatchSubscription(restEnv, { login: "miner1", repoFullName: "acme/widgets" });
    const app = createApp();
    const restBody = await (
      await app.request("/v1/contributors/miner1/watches?repoFullName=acme%2Fwidgets", { method: "DELETE", headers: apiHeaders(restEnv) }, restEnv)
    ).json();

    const toolEnv = createTestEnv();
    await upsertIssueWatchSubscription(toolEnv, { login: "miner1", repoFullName: "acme/widgets" });
    const client = await connectMcp(toolEnv);
    const viaTool = await client.callTool({
      name: "loopover_watch_issues",
      arguments: { login: "miner1", action: "unwatch", repoFullName: "acme/widgets" },
    });
    expect((viaTool as { structuredContent?: unknown }).structuredContent).toEqual(restBody);
  });
});
