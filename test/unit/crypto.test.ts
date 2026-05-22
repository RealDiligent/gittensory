import { describe, expect, it } from "vitest";
import { verifyGitHubSignature } from "../../src/utils/crypto";

describe("webhook signature verification", () => {
  it("accepts valid GitHub HMAC signatures and rejects tampering", async () => {
    const secret = "test-secret";
    const body = JSON.stringify({ action: "opened" });
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);
    const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const signature = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

    await expect(verifyGitHubSignature(body, `sha256=${signature}`, secret)).resolves.toBe(true);
    await expect(verifyGitHubSignature(`${body}x`, `sha256=${signature}`, secret)).resolves.toBe(false);
  });
});
