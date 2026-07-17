import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/routes";
import { LoopoverMcp } from "../../src/mcp/server";
import { createSessionForGitHubUser } from "../../src/auth/security";
import {
  MAX_NOTIFICATION_DELIVERY_ID_LENGTH,
  MAX_NOTIFICATION_MARK_READ_IDS,
  insertNotificationDeliveryIfAbsent,
  markNotificationDeliveryDelivered,
} from "../../src/db/repositories";
import { loadContributorNotificationFeed, markContributorNotificationsRead } from "../../src/notifications/service";
import { createTestEnv } from "../helpers/d1";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const apiHeaders = (env: Env) => ({ authorization: `Bearer ${env.LOOPOVER_API_TOKEN}` });

async function seedDelivered(env: Env, recipientLogin: string, dedupKey: string) {
  const { delivery } = await insertNotificationDeliveryIfAbsent(env, {
    dedupKey,
    channel: "badge",
    recipientLogin,
    eventType: "pull_request_changes_requested",
    repoFullName: "owner/repo",
    pullNumber: 7,
    title: "Changes requested on owner/repo#7",
    body: "A reviewer requested changes on your pull request owner/repo#7.",
    deeplink: "https://github.com/owner/repo/pull/7",
    actorLogin: "reviewer",
  });
  await markNotificationDeliveryDelivered(env, delivery.id);
  return delivery.id;
}

describe("GET/POST /v1/contributors/:login/notifications (#6745)", () => {
  it("lists unread notifications for the authenticated contributor", async () => {
    const app = createApp();
    const env = createTestEnv();
    await seedDelivered(env, "miner", "k1");

    const response = await app.request("/v1/contributors/miner/notifications", { headers: apiHeaders(env) }, env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      login: "miner",
      unreadCount: 1,
      summary: "LoopOver notifications for miner: 1 unread.",
      notifications: [{ repoFullName: "owner/repo", pullNumber: 7, status: "delivered" }],
    });
  });

  it("marks all notifications read, then specific ids", async () => {
    const app = createApp();
    const env = createTestEnv();
    await seedDelivered(env, "miner", "k2");
    const idB = await seedDelivered(env, "miner", "k3");

    const markAll = await app.request("/v1/contributors/miner/notifications/read", {
      method: "POST",
      headers: { ...apiHeaders(env), "content-type": "application/json" },
      body: JSON.stringify({}),
    }, env);
    expect(markAll.status).toBe(200);
    await expect(markAll.json()).resolves.toMatchObject({ login: "miner", marked: 2 });

    const idC = await seedDelivered(env, "miner", "k4");
    const markOne = await app.request("/v1/contributors/miner/notifications/read", {
      method: "POST",
      headers: { ...apiHeaders(env), "content-type": "application/json" },
      body: JSON.stringify({ ids: [idC] }),
    }, env);
    expect(markOne.status).toBe(200);
    await expect(markOne.json()).resolves.toMatchObject({ login: "miner", marked: 1 });
    expect(idB).toBeTruthy();
  });

  it("rejects invalid mark-read payloads", async () => {
    const app = createApp();
    const env = createTestEnv();

    const tooMany = await app.request("/v1/contributors/miner/notifications/read", {
      method: "POST",
      headers: { ...apiHeaders(env), "content-type": "application/json" },
      body: JSON.stringify({ ids: Array.from({ length: MAX_NOTIFICATION_MARK_READ_IDS + 1 }, (_, i) => `id-${i}`) }),
    }, env);
    expect(tooMany.status).toBe(400);

    const tooLong = await app.request("/v1/contributors/miner/notifications/read", {
      method: "POST",
      headers: { ...apiHeaders(env), "content-type": "application/json" },
      body: JSON.stringify({ ids: ["x".repeat(MAX_NOTIFICATION_DELIVERY_ID_LENGTH + 1)] }),
    }, env);
    expect(tooLong.status).toBe(400);

    const badJson = await app.request("/v1/contributors/miner/notifications/read", {
      method: "POST",
      headers: { ...apiHeaders(env), "content-type": "application/json" },
      body: "{",
    }, env);
    // malformed JSON falls through to {} → mark-all of zero
    expect(badJson.status).toBe(200);
    await expect(badJson.json()).resolves.toMatchObject({ marked: 0 });
  });

  it("rejects unauthenticated callers and forbids cross-login sessions", async () => {
    const app = createApp();
    const env = createTestEnv({ ADMIN_GITHUB_LOGINS: "miner" });
    const unauth = await app.request("/v1/contributors/miner/notifications", {}, env);
    expect(unauth.status).toBeGreaterThanOrEqual(401);

    const { token } = await createSessionForGitHubUser(env, { login: "miner", id: 1 });
    const forbidden = await app.request("/v1/contributors/other/notifications", {
      headers: { authorization: `Bearer ${token}` },
    }, env);
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({ error: "forbidden_contributor" });
  });

  it("matches the host MCP tool payloads for the same login (mirror parity)", async () => {
    const env = createTestEnv();
    await seedDelivered(env, "miner", "parity");

    const viaBuilder = await loadContributorNotificationFeed(env, "miner");
    const app = createApp();
    const viaRest = await (await app.request("/v1/contributors/miner/notifications", { headers: apiHeaders(env) }, env)).json();

    const server = new LoopoverMcp(env).createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "notifications-parity", version: "0.1.0" }, { capabilities: {} });
    await client.connect(clientTransport);
    const viaMcp = await client.callTool({ name: "loopover_list_notifications", arguments: { login: "miner" } });

    expect(viaRest).toEqual(viaBuilder);
    expect((viaMcp as { structuredContent?: unknown }).structuredContent).toEqual(viaBuilder);

    const markEnv = createTestEnv();
    await seedDelivered(markEnv, "miner", "parity-mark");
    const markBuilder = await markContributorNotificationsRead(markEnv, "miner");

    const markEnv2 = createTestEnv();
    await seedDelivered(markEnv2, "miner", "parity-mark-rest");
    const markRest = await (
      await app.request(
        "/v1/contributors/miner/notifications/read",
        {
          method: "POST",
          headers: { ...apiHeaders(markEnv2), "content-type": "application/json" },
          body: JSON.stringify({}),
        },
        markEnv2,
      )
    ).json();

    const markEnv3 = createTestEnv();
    await seedDelivered(markEnv3, "miner", "parity-mark-mcp");
    const markServer = new LoopoverMcp(markEnv3).createServer();
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await markServer.connect(st);
    const markClient = new Client({ name: "notifications-mark-parity", version: "0.1.0" }, { capabilities: {} });
    await markClient.connect(ct);
    const markMcp = await markClient.callTool({ name: "loopover_mark_notifications_read", arguments: { login: "miner" } });

    expect(markRest).toEqual(markBuilder);
    expect((markMcp as { structuredContent?: unknown }).structuredContent).toEqual(markBuilder);
  });
});
