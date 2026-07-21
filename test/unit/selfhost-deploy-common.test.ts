import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const libPath = resolve("scripts/lib/selfhost-deploy-common.sh");

function readOptional(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function createHarness() {
  const dir = mkdtempSync(join(tmpdir(), "loopover-selfhost-deploy-common-"));
  const binDir = join(dir, "bin");
  const infisicalLog = join(dir, "infisical-calls.log");
  mkdirSync(binDir);

  // Wraps a plain `echo` so a test can tell whether the wrapped command actually ran (its own stdout) and,
  // separately, whether it ran directly or via the fake infisical binary below (that binary's own log).
  const wrapperPath = join(dir, "wrapper.sh");
  writeFileSync(
    wrapperPath,
    `#!/usr/bin/env bash
set -euo pipefail
. "${libPath.replace(/\\/g, "/")}"
maybe_infisical_run echo actual-command-ran
`,
  );
  chmodSync(wrapperPath, 0o755);

  function writeFakeInfisical() {
    writeFileSync(
      join(binDir, "infisical"),
      `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${infisicalLog.replace(/\\/g, "/")}"
if [ "\${1:-}" = "run" ] && [ "\${2:-}" = "--" ]; then
  shift 2
  exec "$@"
fi
exit 1
`,
    );
    chmodSync(join(binDir, "infisical"), 0o755);
  }

  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
    readInfisicalCalls: () => readOptional(infisicalLog),
    writeFakeInfisical,
    run(env: Record<string, string> = {}) {
      return spawnSync("bash", [wrapperPath], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}`, ...env },
      });
    },
  };
}

describe("maybe_infisical_run (#5120)", () => {
  it("runs the wrapped command directly when SELFHOST_USE_INFISICAL is unset -- the zero-dependency default path", () => {
    const harness = createHarness();
    try {
      const result = harness.run();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("actual-command-ran");
      expect(harness.readInfisicalCalls()).toBe("");
    } finally {
      harness.cleanup();
    }
  });

  it("runs the wrapped command directly when SELFHOST_USE_INFISICAL=0 (explicit opt-out, same as default)", () => {
    const harness = createHarness();
    try {
      const result = harness.run({ SELFHOST_USE_INFISICAL: "0" });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("actual-command-ran");
      expect(harness.readInfisicalCalls()).toBe("");
    } finally {
      harness.cleanup();
    }
  });

  it("prefixes the command with `infisical run --` when SELFHOST_USE_INFISICAL=1 and infisical is available", () => {
    const harness = createHarness();
    harness.writeFakeInfisical();
    try {
      const result = harness.run({ SELFHOST_USE_INFISICAL: "1" });
      expect(result.status, result.stderr).toBe(0);
      // The wrapped command still genuinely ran (via infisical's own exec passthrough)...
      expect(result.stdout).toContain("actual-command-ran");
      // ...and it ran THROUGH infisical, not directly -- proving the opt-in actually wires the wrapper in.
      expect(harness.readInfisicalCalls()).toBe("run -- echo actual-command-ran\n");
    } finally {
      harness.cleanup();
    }
  });

  it("fails closed with a clear error when SELFHOST_USE_INFISICAL=1 but infisical is not installed", () => {
    const harness = createHarness();
    try {
      const result = harness.run({ SELFHOST_USE_INFISICAL: "1" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("required command not found: infisical");
      expect(result.stdout).not.toContain("actual-command-ran");
    } finally {
      harness.cleanup();
    }
  });
});

describe("env_put (#7766 -- atomic write + mode preservation)", () => {
  // Source the lib and invoke env_put directly with (key, value, file) positional args.
  function runEnvPut(file: string, key: string, value: string) {
    const script = `set -euo pipefail; . "${libPath.replace(/\\/g, "/")}"; env_put "$1" "$2" "$3"`;
    return spawnSync("bash", ["-c", script, "bash", key, value, file], { encoding: "utf8" });
  }

  function tempEnvFile(contents: string): { dir: string; file: string } {
    const dir = mkdtempSync(join(tmpdir(), "loopover-env-put-"));
    const file = join(dir, ".env");
    writeFileSync(file, contents);
    return { dir, file };
  }

  it("updates an existing key in place, leaving the rest of the file intact", () => {
    const { dir, file } = tempEnvFile("FOO=1\nBAR=old\n");
    try {
      const r = runEnvPut(file, "BAR", "new");
      expect(r.status, r.stderr).toBe(0);
      expect(readFileSync(file, "utf8")).toBe("FOO=1\nBAR=new\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("appends a key that is not present yet", () => {
    const { dir, file } = tempEnvFile("FOO=1\n");
    try {
      const r = runEnvPut(file, "BAZ", "added");
      expect(r.status, r.stderr).toBe(0);
      expect(readFileSync(file, "utf8")).toBe("FOO=1\nBAZ=added\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves the target file's non-default mode across the write (does not narrow to mktemp's 0600)", () => {
    const { dir, file } = tempEnvFile("FOO=1\n");
    try {
      chmodSync(file, 0o640);
      const r = runEnvPut(file, "FOO", "2");
      expect(r.status, r.stderr).toBe(0);
      expect(statSync(file).mode & 0o777).toBe(0o640);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves no leftover temp file behind (an atomic rename, not a copy)", () => {
    const { dir, file } = tempEnvFile("FOO=1\n");
    try {
      const r = runEnvPut(file, "FOO", "2");
      expect(r.status, r.stderr).toBe(0);
      expect(readdirSync(dir).filter((name) => name.includes(".tmp."))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("compose_file_args exit propagation (#7765)", () => {
  // The exact idiom the callers (deploy-selfhost-image.sh etc.) now use to consume compose_file_args.
  // Under the old `mapfile -t compose_args < <(compose_file_args)` the function ran in a subshell whose
  // `exit 1` on a missing file was swallowed (mapfile returns 0), so the caller continued with an
  // empty/truncated -f arg list. The checked assignment must instead abort before REACHED_END.
  const CONSUMER = `
set -euo pipefail
. "${libPath.replace(/\\/g, "/")}"
if ! compose_args_raw="$(compose_file_args)"; then
  exit 1
fi
mapfile -t compose_args <<< "$compose_args_raw"
printf 'REACHED_END args=[%s]\\n' "\${compose_args[*]}"
`;

  function runConsumer(env: Record<string, string> = {}) {
    const dir = mkdtempSync(join(tmpdir(), "loopover-compose-args-"));
    try {
      // Give the default-branch a real docker-compose.yml so the happy path has a file to find.
      writeFileSync(join(dir, "docker-compose.yml"), "services: {}\n");
      writeFileSync(join(dir, "base.yml"), "services: {}\n");
      return spawnSync("bash", ["-c", CONSUMER], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, ...env },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("continues with the -f args when every compose file exists", () => {
    const result = runConsumer();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("REACHED_END args=[-f docker-compose.yml]");
  });

  it("aborts (never reaching the consumer) when the sole compose file is missing", () => {
    const result = runConsumer({ SELFHOST_COMPOSE_FILES: "does-not-exist.yml" });
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("REACHED_END");
    expect(result.stderr).toContain("compose file not found: does-not-exist.yml");
  });

  it("aborts instead of continuing with a TRUNCATED arg list when a later compose file is missing", () => {
    const result = runConsumer({ SELFHOST_COMPOSE_FILES: "base.yml missing.yml" });
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("REACHED_END");
    expect(result.stderr).toContain("compose file not found: missing.yml");
  });
});

// Generic seam for the remaining library functions (#7769): source the lib in a scratch dir, invoke one
// function with the given args, and return its status/stdout/stderr -- the same spawn-a-real-bash approach as
// createHarness above, but parameterized so env_get/require_cmd can each be driven directly.
// (compose_file_args is already covered by the #7765 suite above.)
function runLibFn(call: string, options: { env?: Record<string, string>; files?: Record<string, string> } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "loopover-selfhost-deploy-common-fn-"));
  try {
    for (const [name, contents] of Object.entries(options.files ?? {})) {
      writeFileSync(join(dir, name), contents);
    }
    const scriptPath = join(dir, "run.sh");
    // set -u is deliberately NOT enabled: env_get reads optional ENV_FILE with `${VAR:-default}` guards,
    // exactly as the real deploy scripts do.
    writeFileSync(scriptPath, `#!/usr/bin/env bash\nset -eo pipefail\n. "${libPath.replace(/\\/g, "/")}"\n${call}\n`);
    chmodSync(scriptPath, 0o755);
    return spawnSync("bash", [scriptPath], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, ...(options.env ?? {}) },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("require_cmd (#7769)", () => {
  it("succeeds silently when the command exists", () => {
    const result = runLibFn("require_cmd bash");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("fails with exit 1 and a clear error when the command is missing", () => {
    const result = runLibFn("require_cmd loopover-definitely-not-a-real-command");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("required command not found: loopover-definitely-not-a-real-command");
  });
});

describe("env_get (#7769)", () => {
  it("returns a plain unquoted value for a matching key", () => {
    const result = runLibFn('env_get FOO "$PWD/.env"', { files: { ".env": "FOO=bar\n" } });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("bar\n");
  });

  it("strips surrounding double and single quotes from the value", () => {
    const dq = runLibFn('env_get FOO "$PWD/.env"', { files: { ".env": 'FOO="quoted value"\n' } });
    expect(dq.status, dq.stderr).toBe(0);
    expect(dq.stdout).toBe("quoted value\n");

    const sq = runLibFn('env_get FOO "$PWD/.env"', { files: { ".env": "FOO='single quoted'\n" } });
    expect(sq.status, sq.stderr).toBe(0);
    expect(sq.stdout).toBe("single quoted\n");
  });

  it("skips comment and blank lines and returns the first matching key", () => {
    const result = runLibFn('env_get FOO "$PWD/.env"', { files: { ".env": "# a comment\n\n  FOO = spaced\nFOO=second\n" } });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("spaced\n");
  });

  it("returns exit 1 when the key is absent from the file", () => {
    const result = runLibFn('env_get MISSING "$PWD/.env"', { files: { ".env": "FOO=bar\n" } });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
  });

  it("returns exit 1 when the file does not exist", () => {
    const result = runLibFn('env_get FOO "$PWD/does-not-exist.env"');
    expect(result.status).toBe(1);
  });

  it("falls back to $ENV_FILE when no file argument is given", () => {
    const result = runLibFn("env_get FOO", {
      files: { ".env": "FOO=from-env-file\n" },
      env: { ENV_FILE: ".env" },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("from-env-file\n");
  });
});
