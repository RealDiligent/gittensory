CREATE TABLE IF NOT EXISTS installations (
  id INTEGER PRIMARY KEY,
  account_login TEXT NOT NULL,
  account_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  repository_selection TEXT,
  permissions_json TEXT NOT NULL DEFAULT '{}',
  events_json TEXT NOT NULL DEFAULT '[]',
  suspended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS repositories (
  full_name TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  installation_id INTEGER,
  is_installed INTEGER NOT NULL DEFAULT 0,
  is_registered INTEGER NOT NULL DEFAULT 0,
  is_private INTEGER NOT NULL DEFAULT 0,
  html_url TEXT,
  default_branch TEXT,
  registry_config_json TEXT,
  emission_share REAL,
  issue_discovery_share REAL,
  maintainer_cut REAL NOT NULL DEFAULT 0,
  label_multipliers_json TEXT NOT NULL DEFAULT '{}',
  last_registry_snapshot_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS repositories_installation_id_idx ON repositories (installation_id);
CREATE INDEX IF NOT EXISTS repositories_registered_idx ON repositories (is_registered);

CREATE TABLE IF NOT EXISTS registry_snapshots (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL,
  source_url TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  repo_count INTEGER NOT NULL,
  total_emission_share REAL NOT NULL,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pull_requests (
  id TEXT PRIMARY KEY,
  repo_full_name TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL,
  author_login TEXT,
  author_association TEXT,
  head_sha TEXT,
  head_ref TEXT,
  base_ref TEXT,
  merged_at TEXT,
  html_url TEXT,
  labels_json TEXT NOT NULL DEFAULT '[]',
  linked_issues_json TEXT NOT NULL DEFAULT '[]',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(repo_full_name, number)
);

CREATE INDEX IF NOT EXISTS pull_requests_repo_idx ON pull_requests (repo_full_name);
CREATE INDEX IF NOT EXISTS pull_requests_head_sha_idx ON pull_requests (head_sha);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  repo_full_name TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL,
  author_login TEXT,
  author_association TEXT,
  html_url TEXT,
  labels_json TEXT NOT NULL DEFAULT '[]',
  linked_prs_json TEXT NOT NULL DEFAULT '[]',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(repo_full_name, number)
);

CREATE INDEX IF NOT EXISTS issues_repo_idx ON issues (repo_full_name);
CREATE INDEX IF NOT EXISTS issues_state_idx ON issues (state);

CREATE TABLE IF NOT EXISTS bounties (
  id TEXT PRIMARY KEY,
  repo_full_name TEXT NOT NULL,
  issue_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  amount_text TEXT,
  source_url TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(repo_full_name, issue_number)
);

CREATE INDEX IF NOT EXISTS bounties_repo_issue_idx ON bounties (repo_full_name, issue_number);

CREATE TABLE IF NOT EXISTS advisories (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_key TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  pull_number INTEGER,
  issue_number INTEGER,
  head_sha TEXT,
  conclusion TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  findings_json TEXT NOT NULL DEFAULT '[]',
  check_run_id INTEGER,
  check_run_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS advisories_target_idx ON advisories (target_type, target_key);
CREATE INDEX IF NOT EXISTS advisories_repo_idx ON advisories (repo_full_name);

CREATE TABLE IF NOT EXISTS webhook_events (
  delivery_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  action TEXT,
  installation_id INTEGER,
  repository_full_name TEXT,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  error_summary TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS webhook_events_status_idx ON webhook_events (status);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  source_kind TEXT,
  source_url TEXT,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  error_summary TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
