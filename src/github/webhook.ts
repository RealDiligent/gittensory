import type { Context } from "hono";
import { getWebhookEvent, recordWebhookEvent } from "../db/repositories";
import type { GitHubWebhookPayload, JobMessage } from "../types";
import { sha256Hex, verifyGitHubSignature } from "../utils/crypto";

export async function handleGitHubWebhook(c: Context<{ Bindings: Env }>): Promise<Response> {
  const deliveryId = c.req.header("x-github-delivery") ?? null;
  const eventName = c.req.header("x-github-event") ?? null;
  const signature = c.req.header("x-hub-signature-256") ?? null;
  if (!deliveryId || !eventName) {
    return c.json({ error: "missing_github_headers" }, 400);
  }

  const rawBody = await c.req.text();
  const verified = await verifyGitHubSignature(rawBody, signature, c.env.GITHUB_WEBHOOK_SECRET);
  if (!verified) {
    return c.json({ error: "invalid_signature" }, 401);
  }

  let payload: GitHubWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as GitHubWebhookPayload;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const payloadHash = await sha256Hex(rawBody);
  const existingEvent = await getWebhookEvent(c.env, deliveryId);
  if (existingEvent && existingEvent.payloadHash === payloadHash && existingEvent.status !== "error") {
    return c.json({ ok: true, deliveryId, eventName, status: "duplicate" }, 202);
  }

  await recordWebhookEvent(c.env, {
    deliveryId,
    eventName,
    action: payload.action,
    installationId: payload.installation?.id,
    repositoryFullName: payload.repository?.full_name,
    payloadHash,
    status: "queued",
  });

  const message: JobMessage = {
    type: "github-webhook",
    deliveryId,
    eventName,
    payload,
  };
  await c.env.JOBS.send(message);

  return c.json({ ok: true, deliveryId, eventName, status: "queued" }, 202);
}
