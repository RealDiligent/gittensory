import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const FindingSchema = z
  .object({
    code: z.string(),
    title: z.string(),
    severity: z.enum(["info", "warning", "critical"]),
    detail: z.string(),
    action: z.string().optional(),
    publicText: z.string().optional(),
  })
  .openapi("Finding");

export const AdvisorySchema = z
  .object({
    id: z.string(),
    targetType: z.enum(["repository", "pull_request", "issue"]),
    targetKey: z.string(),
    repoFullName: z.string(),
    pullNumber: z.number().optional(),
    issueNumber: z.number().optional(),
    headSha: z.string().optional(),
    conclusion: z.enum(["success", "neutral", "action_required"]),
    severity: z.enum(["info", "warning", "critical"]),
    title: z.string(),
    summary: z.string(),
    findings: z.array(FindingSchema),
    generatedAt: z.string(),
  })
  .openapi("Advisory");

export const RegistryRepoSchema = z
  .object({
    repo: z.string(),
    emissionShare: z.number(),
    issueDiscoveryShare: z.number(),
    labelMultipliers: z.record(z.number()),
    trustedLabelPipeline: z.boolean().nullable().optional(),
    maintainerCut: z.number(),
    defaultLabelMultiplier: z.number().nullable().optional(),
    fixedBaseScore: z.number().nullable().optional(),
    eligibilityMode: z.string().nullable().optional(),
    raw: z.record(z.unknown()),
  })
  .openapi("RegistryRepo");

export const RegistrySnapshotSchema = z
  .object({
    id: z.string(),
    generatedAt: z.string(),
    fetchedAt: z.string(),
    source: z.object({
      kind: z.enum(["api", "raw-github"]),
      url: z.string(),
    }),
    repoCount: z.number(),
    totalEmissionShare: z.number(),
    warnings: z.array(z.string()),
    repositories: z.array(RegistryRepoSchema),
  })
  .openapi("RegistrySnapshot");

export const RepositorySchema = z
  .object({
    fullName: z.string(),
    owner: z.string(),
    name: z.string(),
    installationId: z.number().nullable().optional(),
    isInstalled: z.boolean(),
    isRegistered: z.boolean(),
    isPrivate: z.boolean(),
    htmlUrl: z.string().nullable().optional(),
    defaultBranch: z.string().nullable().optional(),
    registryConfig: RegistryRepoSchema.nullable().optional(),
  })
  .openapi("Repository");

export const WorkboardItemSchema = z
  .object({
    repoFullName: z.string(),
    issueNumber: z.number(),
    title: z.string(),
    state: z.string(),
    htmlUrl: z.string().nullable().optional(),
    fit: z.enum(["good", "caution", "hold"]),
    reasons: z.array(z.string()),
  })
  .openapi("WorkboardItem");

export const HealthSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("gittensory-api"),
    time: z.string(),
  })
  .openapi("Health");
