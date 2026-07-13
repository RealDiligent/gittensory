import { readFileSync } from "node:fs";
import { resolveFirstConfiguredCodingAgentDriverName } from "@jsonbored/gittensory-engine";

/** Env vars whose `<NAME>_FILE` companion may be dereferenced at CLI startup (#5178). `GITHUB_TOKEN` is always
 *  eligible; coding-agent credential env vars are added only for the configured provider. Codex-cli authenticates
 *  via a readable `auth.json` (see `resolveCodexAuthPath`) rather than a secret env var, so it has no `_FILE`
 *  pair here. */
export const ALWAYS_FILE_CREDENTIAL_ENV_VARS = Object.freeze(["GITHUB_TOKEN"]);

/** Per-provider credential env vars that support `<NAME>_FILE` indirection when that provider is active. */
export const PROVIDER_FILE_CREDENTIAL_ENV_VARS = Object.freeze({
  "claude-cli": Object.freeze(["CLAUDE_CODE_OAUTH_TOKEN"]),
  "agent-sdk": Object.freeze(["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"]),
  "codex-cli": Object.freeze([]),
  noop: Object.freeze([]),
});

/**
 * Credential env var names whose `_FILE` companions may be read for the current `env` snapshot.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {readonly string[]}
 */
export function resolveFileCredentialEnvVarNames(env) {
  const provider = resolveFirstConfiguredCodingAgentDriverName(env)?.trim().toLowerCase() ?? null;
  const providerVars =
    provider && provider in PROVIDER_FILE_CREDENTIAL_ENV_VARS
      ? PROVIDER_FILE_CREDENTIAL_ENV_VARS[provider]
      : [];
  return [...ALWAYS_FILE_CREDENTIAL_ENV_VARS, ...providerVars];
}

/**
 * Resolve one credential from its optional `<NAME>_FILE` companion. Precedence matches
 * `src/selfhost/load-file-secrets.ts`: when the plain `<NAME>` env var is already set to a truthy value, it wins.
 * When only `<NAME>_FILE` is set, the trimmed file contents become `<NAME>`.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 * @param {(path: string) => string} readFile
 * @returns {"env" | "file" | "absent"}
 */
export function resolveFileCredential(env, name, readFile) {
  if (env[name]) {
    return "env";
  }

  const fileVar = `${name}_FILE`;
  const filePath = env[fileVar];
  if (typeof filePath !== "string" || !filePath.trim()) {
    return "absent";
  }

  const resolvedPath = filePath.trim();
  try {
    env[name] = readFile(resolvedPath).trim();
    return "file";
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`credential file unreadable: ${fileVar}=${resolvedPath} (${reason})`);
  }
}

/**
 * Dereference `<NAME>_FILE` into `<NAME>` for fleet-mode secrets. Mutates `env` in place (typically
 * `process.env`). Throws on an unreadable `_FILE` path — never silently falls through to an empty credential.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{ readFile?: (path: string) => string }} [options]
 */
export function loadFileCredentials(env = process.env, options = {}) {
  const readFile = options.readFile ?? ((path) => readFileSync(path, "utf8"));
  for (const name of resolveFileCredentialEnvVarNames(env)) {
    resolveFileCredential(env, name, readFile);
  }
}
