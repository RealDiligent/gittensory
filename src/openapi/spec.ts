import { OpenApiGeneratorV3, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  AdvisorySchema,
  HealthSchema,
  RegistrySnapshotSchema,
  RepositorySchema,
  WorkboardItemSchema,
} from "./schemas";

export function buildOpenApiSpec() {
  const registry = new OpenAPIRegistry();
  registry.register("Health", HealthSchema);
  registry.register("RegistrySnapshot", RegistrySnapshotSchema);
  registry.register("Repository", RepositorySchema);
  registry.register("Advisory", AdvisorySchema);
  registry.register("WorkboardItem", WorkboardItemSchema);

  registry.registerPath({
    method: "get",
    path: "/health",
    responses: {
      200: { description: "Service health", content: { "application/json": { schema: HealthSchema } } },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/registry/snapshot",
    responses: {
      200: { description: "Latest Gittensor registry snapshot", content: { "application/json": { schema: RegistrySnapshotSchema } } },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/repos",
    responses: {
      200: { description: "Known repositories", content: { "application/json": { schema: RepositorySchema.array() } } },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/repos/{owner}/{repo}",
    responses: {
      200: { description: "Repository detail", content: { "application/json": { schema: RepositorySchema } } },
      404: { description: "Repository not found" },
    },
  });
  for (const path of [
    "/v1/repos/{owner}/{repo}/advisory",
    "/v1/repos/{owner}/{repo}/pulls/{number}/advisory",
    "/v1/repos/{owner}/{repo}/issues/{number}/advisory",
  ]) {
    registry.registerPath({
      method: "get",
      path,
      responses: {
        200: { description: "Generated advisory", content: { "application/json": { schema: AdvisorySchema } } },
      },
    });
  }
  registry.registerPath({
    method: "get",
    path: "/v1/repos/{owner}/{repo}/workboard",
    responses: {
      200: { description: "Contributor workboard", content: { "application/json": { schema: WorkboardItemSchema.array() } } },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/v1/github/webhook",
    responses: {
      202: { description: "Webhook queued" },
      401: { description: "Invalid webhook signature" },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/v1/internal/jobs/refresh-registry",
    responses: {
      202: { description: "Registry refresh queued" },
      401: { description: "Invalid internal token" },
    },
  });

  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Gittensory API",
      version: "0.1.0",
      description: "Backend API for Gittensory advisory checks and Gittensor repository context.",
    },
  });
}
