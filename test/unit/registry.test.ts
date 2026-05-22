import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeRegistryPayload } from "../../src/registry/normalize";
import { getLatestRegistrySnapshot, persistRegistrySnapshot, refreshRegistry } from "../../src/registry/sync";
import { createTestEnv } from "../helpers/d1";

describe("registry normalization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes raw master repository config", () => {
    const snapshot = normalizeRegistryPayload(
      {
        "JSONbored/awesome-claude": {
          emission_share: 0.01,
          issue_discovery_share: 0,
          label_multipliers: { feature: 1.5 },
          maintainer_cut: 0.25,
        },
      },
      { kind: "raw-github", url: "https://example.test/master_repositories.json" },
      "2026-05-22T00:00:00.000Z",
    );

    expect(snapshot.repoCount).toBe(1);
    expect(snapshot.totalEmissionShare).toBe(0.01);
    expect(snapshot.repositories[0]).toMatchObject({
      repo: "JSONbored/awesome-claude",
      emissionShare: 0.01,
      issueDiscoveryShare: 0,
      labelMultipliers: { feature: 1.5 },
      maintainerCut: 0.25,
    });
  });

  it("persists and reads the latest snapshot from D1", async () => {
    const env = createTestEnv();
    const snapshot = normalizeRegistryPayload(
      { "JSONbored/gittensory": { emission_share: 0.02, issue_discovery_share: 0.5 } },
      { kind: "raw-github", url: "https://example.test/master_repositories.json" },
      "2026-05-22T00:00:00.000Z",
    );

    await persistRegistrySnapshot(env, snapshot);
    const latest = await getLatestRegistrySnapshot(env);

    expect(latest?.repositories[0]?.repo).toBe("JSONbored/gittensory");
    expect(latest?.source.kind).toBe("raw-github");
  });

  it("falls back to raw GitHub when registry API probes fail", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("raw.githubusercontent.com")) {
        return Response.json({ "JSONbored/gittensory": { emission_share: 0.02, issue_discovery_share: 0.5 } });
      }
      return new Response("not found", { status: 404 });
    });

    const snapshot = await refreshRegistry(createTestEnv());

    expect(snapshot.source.kind).toBe("raw-github");
    expect(snapshot.warnings.length).toBeGreaterThan(0);
    expect(snapshot.repositories[0]?.repo).toBe("JSONbored/gittensory");
  });
});
