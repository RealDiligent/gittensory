import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/routes";
import { createTestEnv } from "../helpers/d1";

describe("api routes", () => {
  it("serves health and OpenAPI without storage", async () => {
    const app = createApp();
    const env = createTestEnv();

    const health = await app.request("/health", {}, env);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ status: "ok", service: "gittensory-api" });

    const spec = await app.request("/openapi.json", {}, env);
    expect(spec.status).toBe(200);
    await expect(spec.json()).resolves.toMatchObject({ info: { title: "Gittensory API" } });
  });

  it("queues signed GitHub webhooks and rejects invalid signatures", async () => {
    const app = createApp();
    const queued: unknown[] = [];
    const env = createTestEnv({
      JOBS: {
        async send(message: unknown) {
          queued.push(message);
        },
      } as unknown as Queue,
    });
    const body = JSON.stringify({
      action: "opened",
      installation: { id: 123 },
      repository: { full_name: "JSONbored/gittensory", name: "gittensory" },
    });
    const signature = await signWebhook(body, env.GITHUB_WEBHOOK_SECRET);

    const accepted = await app.request(
      "/v1/github/webhook",
      {
        method: "POST",
        body,
        headers: {
          "x-github-delivery": "delivery-1",
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
        },
      },
      env,
    );

    expect(accepted.status).toBe(202);
    expect(queued).toHaveLength(1);

    const duplicate = await app.request(
      "/v1/github/webhook",
      {
        method: "POST",
        body,
        headers: {
          "x-github-delivery": "delivery-1",
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
        },
      },
      env,
    );

    expect(duplicate.status).toBe(202);
    expect(await duplicate.json()).toMatchObject({ status: "duplicate" });
    expect(queued).toHaveLength(1);

    const rejected = await app.request(
      "/v1/github/webhook",
      {
        method: "POST",
        body,
        headers: {
          "x-github-delivery": "delivery-2",
          "x-github-event": "pull_request",
          "x-hub-signature-256": "sha256=bad",
        },
      },
      env,
    );

    expect(rejected.status).toBe(401);
  });
});

async function signWebhook(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `sha256=${[...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
