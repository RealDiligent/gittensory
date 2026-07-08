import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function loadCliSemverHelpers(): {
  parseSemver: (version: string) => { major: number; minor: number; patch: number; prerelease: string | null } | null;
  compareSemver: (a: string, b: string) => number | null;
} {
  const cliPath = new URL("../../packages/gittensory-mcp/bin/gittensory-mcp.js", import.meta.url);
  const source = readFileSync(cliPath, "utf8");
  const parseStart = source.indexOf("function parseSemver(version)");
  const classifyStart = source.indexOf("function classifyVersionState(");
  if (parseStart < 0 || classifyStart < 0 || classifyStart <= parseStart) {
    throw new Error("Could not locate semver helpers in gittensory-mcp.js");
  }
  const semverBlock = source.slice(parseStart, classifyStart);
  return new Function(`${semverBlock}\nreturn { parseSemver, compareSemver };`)() as {
    parseSemver: (version: string) => { major: number; minor: number; patch: number; prerelease: string | null } | null;
    compareSemver: (a: string, b: string) => number | null;
  };
}

describe("mcp CLI semver parsing", () => {
  const { parseSemver, compareSemver } = loadCliSemverHelpers();

  it("rejects trailing non-semver junk instead of silently accepting it", () => {
    expect(parseSemver("0.6.0 trailing")).toBeNull();
    expect(compareSemver("0.6.0 trailing", "0.6.0")).toBeNull();
    expect(compareSemver("0.6.0", "0.6.0 trailing")).toBeNull();
  });

  it("keeps valid semver behavior unchanged", () => {
    expect(parseSemver("v0.6.0")).toEqual({ major: 0, minor: 6, patch: 0, prerelease: null });
    expect(parseSemver("0.6.0-rc.1")).toEqual({ major: 0, minor: 6, patch: 0, prerelease: "rc.1" });
    expect(compareSemver("0.6.0", "0.6.0-rc.1")).toBe(1);
  });
});
