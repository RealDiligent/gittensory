import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const installations = sqliteTable("installations", {
  id: integer("id").primaryKey(),
  accountLogin: text("account_login").notNull(),
  accountId: integer("account_id").notNull(),
  targetType: text("target_type").notNull(),
  repositorySelection: text("repository_selection"),
  permissionsJson: text("permissions_json").notNull().default("{}"),
  eventsJson: text("events_json").notNull().default("[]"),
  suspendedAt: text("suspended_at"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const repositories = sqliteTable("repositories", {
  fullName: text("full_name").primaryKey(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  installationId: integer("installation_id"),
  isInstalled: integer("is_installed", { mode: "boolean" }).notNull().default(false),
  isRegistered: integer("is_registered", { mode: "boolean" }).notNull().default(false),
  isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(false),
  htmlUrl: text("html_url"),
  defaultBranch: text("default_branch"),
  registryConfigJson: text("registry_config_json"),
  emissionShare: real("emission_share"),
  issueDiscoveryShare: real("issue_discovery_share"),
  maintainerCut: real("maintainer_cut").notNull().default(0),
  labelMultipliersJson: text("label_multipliers_json").notNull().default("{}"),
  lastRegistrySnapshotId: text("last_registry_snapshot_id"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const registrySnapshots = sqliteTable("registry_snapshots", {
  id: text("id").primaryKey(),
  sourceKind: text("source_kind").notNull(),
  sourceUrl: text("source_url").notNull(),
  generatedAt: text("generated_at").notNull(),
  fetchedAt: text("fetched_at").notNull(),
  repoCount: integer("repo_count").notNull(),
  totalEmissionShare: real("total_emission_share").notNull(),
  warningsJson: text("warnings_json").notNull().default("[]"),
  payloadJson: text("payload_json").notNull(),
});

export const pullRequests = sqliteTable(
  "pull_requests",
  {
    id: text("id").primaryKey(),
    repoFullName: text("repo_full_name").notNull(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    state: text("state").notNull(),
    authorLogin: text("author_login"),
    authorAssociation: text("author_association"),
    headSha: text("head_sha"),
    headRef: text("head_ref"),
    baseRef: text("base_ref"),
    mergedAt: text("merged_at"),
    htmlUrl: text("html_url"),
    labelsJson: text("labels_json").notNull().default("[]"),
    linkedIssuesJson: text("linked_issues_json").notNull().default("[]"),
    payloadJson: text("payload_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
    updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => ({
    repoNumber: uniqueIndex("pull_requests_repo_number_unique").on(table.repoFullName, table.number),
  }),
);

export const issues = sqliteTable(
  "issues",
  {
    id: text("id").primaryKey(),
    repoFullName: text("repo_full_name").notNull(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    state: text("state").notNull(),
    authorLogin: text("author_login"),
    authorAssociation: text("author_association"),
    htmlUrl: text("html_url"),
    labelsJson: text("labels_json").notNull().default("[]"),
    linkedPrsJson: text("linked_prs_json").notNull().default("[]"),
    payloadJson: text("payload_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
    updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => ({
    repoNumber: uniqueIndex("issues_repo_number_unique").on(table.repoFullName, table.number),
  }),
);

export const bounties = sqliteTable(
  "bounties",
  {
    id: text("id").primaryKey(),
    repoFullName: text("repo_full_name").notNull(),
    issueNumber: integer("issue_number").notNull(),
    status: text("status").notNull(),
    amountText: text("amount_text"),
    sourceUrl: text("source_url"),
    payloadJson: text("payload_json").notNull().default("{}"),
    discoveredAt: text("discovered_at").notNull().default("CURRENT_TIMESTAMP"),
    updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => ({
    repoIssue: uniqueIndex("bounties_repo_issue_unique").on(table.repoFullName, table.issueNumber),
  }),
);

export const advisories = sqliteTable("advisories", {
  id: text("id").primaryKey(),
  targetType: text("target_type").notNull(),
  targetKey: text("target_key").notNull(),
  repoFullName: text("repo_full_name").notNull(),
  pullNumber: integer("pull_number"),
  issueNumber: integer("issue_number"),
  headSha: text("head_sha"),
  conclusion: text("conclusion").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  findingsJson: text("findings_json").notNull().default("[]"),
  checkRunId: integer("check_run_id"),
  checkRunUrl: text("check_run_url"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const webhookEvents = sqliteTable("webhook_events", {
  deliveryId: text("delivery_id").primaryKey(),
  eventName: text("event_name").notNull(),
  action: text("action"),
  installationId: integer("installation_id"),
  repositoryFullName: text("repository_full_name"),
  payloadHash: text("payload_hash").notNull(),
  status: text("status").notNull(),
  errorSummary: text("error_summary"),
  receivedAt: text("received_at").notNull().default("CURRENT_TIMESTAMP"),
  processedAt: text("processed_at"),
});

export const syncRuns = sqliteTable("sync_runs", {
  id: text("id").primaryKey(),
  jobType: text("job_type").notNull(),
  status: text("status").notNull(),
  sourceKind: text("source_kind"),
  sourceUrl: text("source_url"),
  warningsJson: text("warnings_json").notNull().default("[]"),
  errorSummary: text("error_summary"),
  startedAt: text("started_at").notNull().default("CURRENT_TIMESTAMP"),
  completedAt: text("completed_at"),
});
