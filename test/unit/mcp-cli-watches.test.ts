// #6746: the CLI mirror for loopover_watch_issues. GET/POST/DELETE /v1/contributors/:login/watches serve the
// same payload as the MCP tool; these pin: `watch-issues list|watch|unwatch --json` stays byte-identical to the
// route fixtures, plain-text paths print the summary, and login resolution matches sibling contributor commands.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeFixtureServer, run, runAsync, runExpectingFailure, startFixtureServer, watchesFixture } from "./support/mcp-cli-harness";

let apiUrl: string;
let watchRequests: Array<{ method: string; url: string; body?: unknown }>;

async function connect() {
  watchRequests = [];
  apiUrl = await startFixtureServer({ onWatchRequest: (info) => watchRequests.push(info) });
}

async function disconnect() {
  await closeFixtureServer();
}

describe("loopover-mcp watch-issues CLI", () => {
  beforeEach(connect);
  afterEach(disconnect);

  it("list --json emits exactly the watches the route returns", async () => {
    const out = await runAsync(["watch-issues", "list", "--login", "JSONbored", "--json"], { LOOPOVER_API_URL: apiUrl, LOOPOVER_TOKEN: "session-token" });
    expect(JSON.parse(out)).toEqual(watchesFixture("JSONbored"));
  });

  it("list prints the summary and a line per watched repo", async () => {
    const out = await runAsync(["watch-issues", "list", "--login", "JSONbored"], { LOOPOVER_API_URL: apiUrl, LOOPOVER_TOKEN: "session-token" });
    expect(out).toContain("Watching 1 repo(s) for new grabbable issues.");
    expect(out).toContain("JSONbored/loopover [bug]");
  });

  it("watch POSTs { repoFullName, labels } and --json returns the updated payload", async () => {
    const out = await runAsync(["watch-issues", "watch", "acme/widgets", "--login", "JSONbored", "--labels", "bug,good first issue", "--json"], {
      LOOPOVER_API_URL: apiUrl,
      LOOPOVER_TOKEN: "session-token",
    });
    const payload = JSON.parse(out) as { watching: Array<{ repoFullName: string; labels: string[] }>; changed?: string };
    expect(payload.watching).toEqual([{ repoFullName: "acme/widgets", labels: ["bug", "good first issue"] }]);
    expect(payload.changed).toContain("watching acme/widgets");
    expect(watchRequests).toContainEqual({
      method: "POST",
      url: "/v1/contributors/JSONbored/watches",
      body: { repoFullName: "acme/widgets", labels: ["bug", "good first issue"] },
    });
  });

  it("unwatch DELETEs with ?repoFullName= and --json returns the emptied list", async () => {
    const out = await runAsync(["watch-issues", "unwatch", "JSONbored/loopover", "--login", "JSONbored", "--json"], {
      LOOPOVER_API_URL: apiUrl,
      LOOPOVER_TOKEN: "session-token",
    });
    const payload = JSON.parse(out) as { watching: unknown[]; changed?: string };
    expect(payload.watching).toEqual([]);
    expect(payload.changed).toBe("unwatched JSONbored/loopover");
    expect(watchRequests.some((r) => r.method === "DELETE" && r.url.includes("repoFullName=JSONbored%2Floopover"))).toBe(true);
  });

  it("resolves the login from LOOPOVER_LOGIN, then GITHUB_LOGIN", async () => {
    const viaLoopoverLogin = await runAsync(["watch-issues", "list", "--json"], {
      LOOPOVER_API_URL: apiUrl,
      LOOPOVER_TOKEN: "session-token",
      LOOPOVER_LOGIN: "JSONbored",
    });
    expect(JSON.parse(viaLoopoverLogin)).toEqual(watchesFixture("JSONbored"));
    const viaGithubLogin = await runAsync(["watch-issues", "list", "--json"], {
      LOOPOVER_API_URL: apiUrl,
      LOOPOVER_TOKEN: "session-token",
      GITHUB_LOGIN: "JSONbored",
    });
    expect(JSON.parse(viaGithubLogin)).toEqual(watchesFixture("JSONbored"));
  });

  it("fails with the shared login-required message when no login is resolvable", () => {
    const failure = runExpectingFailure(["watch-issues", "list"], {
      LOOPOVER_API_URL: apiUrl,
      LOOPOVER_TOKEN: "session-token",
      LOOPOVER_LOGIN: "",
      GITHUB_LOGIN: "",
    });
    expect(failure.status).toBe(1);
    expect(`${failure.stdout}${failure.stderr}`).toMatch(/Pass --login <github-login>/);
  });

  it("fails when watch/unwatch omit the repo", () => {
    const failure = runExpectingFailure(["watch-issues", "watch", "--login", "JSONbored"], {
      LOOPOVER_API_URL: apiUrl,
      LOOPOVER_TOKEN: "session-token",
    });
    expect(failure.status).toBe(1);
    expect(`${failure.stdout}${failure.stderr}`).toMatch(/watch-issues watch <owner\/repo>/);
  });

  it("rejects an unknown subcommand", () => {
    const failure = runExpectingFailure(["watch-issues", "pause", "--login", "JSONbored"], {
      LOOPOVER_API_URL: apiUrl,
      LOOPOVER_TOKEN: "session-token",
    });
    expect(failure.status).toBe(1);
    expect(`${failure.stdout}${failure.stderr}`).toMatch(/Unknown watch-issues subcommand/);
  });

  it("strips ANSI escapes from API-chosen summary on the plain-text path but not from --json", async () => {
    await closeFixtureServer();
    const esc = String.fromCharCode(27);
    const hostileSummary = `${esc}[31mFAKE WATCH${esc}[0m`;
    const hostileUrl = await startFixtureServer({
      watches: { summary: hostileSummary, watching: [{ repoFullName: "acme/x", labels: [] }] },
    });
    const env = { LOOPOVER_API_URL: hostileUrl, LOOPOVER_TOKEN: "session-token" };

    const plain = await runAsync(["watch-issues", "list", "--login", "JSONbored"], env);
    expect(plain).not.toContain(esc);
    expect(plain).toContain("FAKE WATCH");

    const asJson = await runAsync(["watch-issues", "list", "--login", "JSONbored", "--json"], env);
    expect(JSON.parse(asJson).summary).toBe(hostileSummary);
  });

  it("documents itself in --help, in its own --help, and in the shell-completion command list", () => {
    expect(run(["--help"])).toContain("loopover-mcp watch-issues list|watch|unwatch");
    expect(run(["watch-issues", "--help"])).toContain("Mirrors the loopover_watch_issues MCP tool");
    expect(run(["completion", "bash"])).toContain("watch-issues");
  });
});
