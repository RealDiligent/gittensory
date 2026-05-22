import { describe, expect, it } from "vitest";
import { buildOpenApiSpec } from "../../src/openapi/spec";

describe("OpenAPI contract", () => {
  it("exports Lovable-facing backend paths", () => {
    const spec = buildOpenApiSpec();
    expect(spec.paths["/health"]).toBeDefined();
    expect(spec.paths["/v1/registry/snapshot"]).toBeDefined();
    expect(spec.paths["/v1/repos/{owner}/{repo}/pulls/{number}/advisory"]).toBeDefined();
    expect(spec.components?.schemas?.Advisory).toBeDefined();
  });
});
