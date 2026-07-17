// #6745: CLI + stdio mirrors for loopover_list_notifications / loopover_mark_notifications_read.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeFixtureServer,
  markNotificationsReadFixture,
  notificationsFixture,
  run,
  runAsync,
  runExpectingFailure,
  startFixtureServer,
} from "./support/mcp-cli-harness";

const bin = join(process.cwd(), "packages/loopover-mcp/bin/loopover-mcp.js");

let client: Client;
let transport: StdioClientTransport;
let configDir: string;
let apiUrl: string;
let capturedRequests: Array<{ url: string; method: string; body?: unknown }>;

async function connect() {
  configDir = mkdtempSync(join(tmpdir(), "loopover-notifications-"));
  capturedRequests = [];
  apiUrl = await startFixtureServer({
    onApiRequest: (request) => {
      if (request.url && request.url.includes("/notifications")) {
        capturedRequests.push({ url: request.url ?? "", method: request.method ?? "GET" });
      }
    },
  });
  transport = new StdioClientTransport({
    command: "node",
    args: [bin, "--stdio"],
    env: {
      ...process.env,
      LOOPOVER_CONFIG_DIR: configDir,
      LOOPOVER_API_URL: apiUrl,
      LOOPOVER_TOKEN: "session-token",
      LOOPOVER_API_TIMEOUT_MS: "5000",
    },
  });
  client = new Client({ name: "notifications-cli-test", version: "0.0.1" });
  await client.connect(transport);
}

async function disconnect() {
  await client.close().catch(() => undefined);
  await closeFixtureServer();
  if (configDir) rmSync(configDir, { recursive: true, force: true });
}

describe("loopover_list_notifications / mark-read stdio (#6745)", () => {
  beforeEach(connect);
  afterEach(disconnect);

  it("registers both tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("loopover_list_notifications");
    expect(names).toContain("loopover_mark_notifications_read");
  });

  it("proxies list + mark-read to the REST routes", async () => {
    const listed = await client.callTool({ name: "loopover_list_notifications", arguments: { login: "JSONbored" } });
    expect(capturedRequests.some((r) => r.method === "GET" && r.url.includes("/notifications"))).toBe(true);
    expect(JSON.stringify(listed)).toContain(notificationsFixture().summary);

    const marked = await client.callTool({
      name: "loopover_mark_notifications_read",
      arguments: { login: "JSONbored", ids: ["n-1"] },
    });
    expect(capturedRequests.some((r) => r.method === "POST" && r.url.includes("/notifications/read"))).toBe(true);
    expect(JSON.stringify(marked)).toContain("Marked 1");
  });
});

describe("loopover-mcp notifications CLI (#6745)", () => {
  beforeEach(connect);
  afterEach(disconnect);

  it("--json list/mark mirrors the MCP tools for the same login", async () => {
    const viaTool = await client.callTool({ name: "loopover_list_notifications", arguments: { login: "JSONbored" } });
    const toolData = (viaTool as { structuredContent?: unknown }).structuredContent;
    const viaCli = JSON.parse(
      await runAsync(["notifications", "--login", "JSONbored", "--json"], { LOOPOVER_API_URL: apiUrl, LOOPOVER_TOKEN: "session-token" }),
    );
    expect(viaCli).toEqual(notificationsFixture());
    if (toolData !== undefined) expect(viaCli).toEqual(toolData);

    const markTool = await client.callTool({ name: "loopover_mark_notifications_read", arguments: { login: "JSONbored" } });
    const markCli = JSON.parse(
      await runAsync(["mark-notifications-read", "--login", "JSONbored", "--json"], {
        LOOPOVER_API_URL: apiUrl,
        LOOPOVER_TOKEN: "session-token",
      }),
    );
    expect(markCli).toEqual(markNotificationsReadFixture());
    const markData = (markTool as { structuredContent?: unknown }).structuredContent;
    if (markData !== undefined) expect(markCli).toEqual(markData);
  });

  it("prints summaries and forwards --id filters", async () => {
    const listOut = await runAsync(["notifications", "--login", "JSONbored"], {
      LOOPOVER_API_URL: apiUrl,
      LOOPOVER_TOKEN: "session-token",
    });
    expect(listOut).toContain(notificationsFixture().summary);
    expect(listOut).toContain("delivered JSONbored/loopover#42");

    const markOut = await runAsync(["mark-notifications-read", "--login", "JSONbored", "--id", "n-1", "--id", "n-2"], {
      LOOPOVER_API_URL: apiUrl,
      LOOPOVER_TOKEN: "session-token",
    });
    expect(markOut).toContain("Marked 2");
  });

  it("falls back when the API omits summary", async () => {
    await closeFixtureServer();
    const sparseUrl = await startFixtureServer({
      notifications: { summary: "   ", notifications: [] },
      markNotificationsRead: { summary: "", marked: 0 },
    });
    const env = { LOOPOVER_API_URL: sparseUrl, LOOPOVER_TOKEN: "session-token" };
    expect(await runAsync(["notifications", "--login", "JSONbored"], env)).toContain("LoopOver notifications for JSONbored.");
    expect(await runAsync(["mark-notifications-read", "--login", "JSONbored"], env)).toContain(
      "Marked LoopOver notification(s) read for JSONbored.",
    );
  });

  it("requires login and documents --help / completion", () => {
    const failure = runExpectingFailure(["notifications"], {
      LOOPOVER_API_URL: apiUrl,
      LOOPOVER_TOKEN: "session-token",
      LOOPOVER_LOGIN: "",
      GITHUB_LOGIN: "",
    });
    expect(failure.status).toBe(1);

    expect(run(["--help"])).toContain("loopover-mcp notifications --login <github-login> [--json]");
    expect(run(["--help"])).toContain("mark-notifications-read");
    expect(run(["notifications", "--help"])).toContain("Mirrors the loopover_list_notifications MCP tool");
    expect(run(["mark-notifications-read", "--help"])).toContain("Mirrors the loopover_mark_notifications_read MCP tool");
    expect(run(["completion", "bash"])).toContain("notifications");
    expect(run(["completion", "bash"])).toContain("mark-notifications-read");
  });
});
