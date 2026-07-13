import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@jsonbored/gittensory-engine", async () => {
  return import("../../packages/gittensory-engine/src/index");
});

import {
  loadFileCredentials,
  resolveFileCredential,
  resolveFileCredentialEnvVarNames,
} from "../../packages/gittensory-miner/lib/load-file-credentials.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempSecretFile(contents: string) {
  const root = mkdtempSync(join(tmpdir(), "gittensory-miner-file-creds-"));
  roots.push(root);
  const path = join(root, "secret.txt");
  writeFileSync(path, contents);
  return path;
}

describe("resolveFileCredentialEnvVarNames (#5178)", () => {
  it("always includes GITHUB_TOKEN and adds Claude vars for claude-cli", () => {
    expect(resolveFileCredentialEnvVarNames({ MINER_CODING_AGENT_PROVIDER: "claude-cli" })).toEqual([
      "GITHUB_TOKEN",
      "CLAUDE_CODE_OAUTH_TOKEN",
    ]);
  });

  it("adds both Claude credential env vars for agent-sdk", () => {
    expect(resolveFileCredentialEnvVarNames({ MINER_CODING_AGENT_PROVIDER: "agent-sdk" })).toEqual([
      "GITHUB_TOKEN",
      "CLAUDE_CODE_OAUTH_TOKEN",
      "ANTHROPIC_API_KEY",
    ]);
  });

  it("includes only GITHUB_TOKEN for codex-cli (auth.json is separate)", () => {
    expect(resolveFileCredentialEnvVarNames({ MINER_CODING_AGENT_PROVIDER: "codex-cli" })).toEqual([
      "GITHUB_TOKEN",
    ]);
  });
});

describe("resolveFileCredential (#5178)", () => {
  it("keeps a plain env credential when both plain and _FILE are set", () => {
    const env: Record<string, string | undefined> = {
      GITHUB_TOKEN: "from-env",
      GITHUB_TOKEN_FILE: "/run/secrets/github_token",
    };
    const readFile = vi.fn(() => "from-file");
    expect(resolveFileCredential(env, "GITHUB_TOKEN", readFile)).toBe("env");
    expect(readFile).not.toHaveBeenCalled();
    expect(env.GITHUB_TOKEN).toBe("from-env");
  });

  it("reads _FILE when the plain env var is unset", () => {
    const path = tempSecretFile("token-from-file\n");
    const env: Record<string, string | undefined> = { GITHUB_TOKEN_FILE: path };
    expect(resolveFileCredential(env, "GITHUB_TOKEN", (p) => readFileSync(p, "utf8"))).toBe("file");
    expect(env.GITHUB_TOKEN).toBe("token-from-file");
  });

  it("throws with the file path when _FILE is set but unreadable", () => {
    const env: Record<string, string | undefined> = { GITHUB_TOKEN_FILE: "/run/secrets/missing" };
    expect(() => resolveFileCredential(env, "GITHUB_TOKEN", () => {
      throw new Error("ENOENT");
    })).toThrow("credential file unreadable: GITHUB_TOKEN_FILE=/run/secrets/missing");
    expect(env.GITHUB_TOKEN).toBeUndefined();
  });

  it("returns absent when neither plain nor _FILE is set", () => {
    const env = {};
    expect(resolveFileCredential(env, "GITHUB_TOKEN", vi.fn())).toBe("absent");
  });

  it("never returns or logs the secret value through the source indicator", () => {
    const path = tempSecretFile("credential-value");
    const env: Record<string, string | undefined> = { GITHUB_TOKEN_FILE: path };
    const source = resolveFileCredential(env, "GITHUB_TOKEN", (p) => readFileSync(p, "utf8"));
    expect(source).toBe("file");
    expect(["env", "file", "absent"]).toContain(source);
  });
});

describe("loadFileCredentials (#5178)", () => {
  it("REGRESSION: plain-env fleet setup keeps working unchanged", () => {
    const env: Record<string, string | undefined> = {
      GITHUB_TOKEN: "plain-github-token",
      MINER_CODING_AGENT_PROVIDER: "claude-cli",
      CLAUDE_CODE_OAUTH_TOKEN: "plain-oauth-token",
    };
    loadFileCredentials(env, { readFile: vi.fn(() => "should-not-run") });
    expect(env.GITHUB_TOKEN).toBe("plain-github-token");
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("plain-oauth-token");
  });

  it("resolves GITHUB_TOKEN and the active provider credential from _FILE mounts", () => {
    const githubPath = tempSecretFile("github-from-file");
    const claudePath = tempSecretFile("oauth-from-file\n");
    const env: Record<string, string | undefined> = {
      MINER_CODING_AGENT_PROVIDER: "claude-cli",
      GITHUB_TOKEN_FILE: githubPath,
      CLAUDE_CODE_OAUTH_TOKEN_FILE: claudePath,
    };
    loadFileCredentials(env);
    expect(env.GITHUB_TOKEN).toBe("github-from-file");
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("oauth-from-file");
  });

  it("fails fast when any configured _FILE path is unreadable", () => {
    const env = {
      MINER_CODING_AGENT_PROVIDER: "claude-cli",
      GITHUB_TOKEN_FILE: "/missing/github",
    };
    expect(() => loadFileCredentials(env, { readFile: () => { throw new Error("ENOENT"); } })).toThrow(
      "GITHUB_TOKEN_FILE=/missing/github",
    );
  });

  it("lets doctor see GITHUB_TOKEN after _FILE resolution (#5178 + #5170)", async () => {
    const { checkGitHubTokenPresent } = await import("../../packages/gittensory-miner/lib/status.js");
    const path = tempSecretFile("doctor-token");
    const env: Record<string, string | undefined> = { GITHUB_TOKEN_FILE: path };
    loadFileCredentials(env);
    expect(checkGitHubTokenPresent(env).ok).toBe(true);
  });
});
