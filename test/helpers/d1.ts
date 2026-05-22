import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

type BoundValue = string | number | null | Uint8Array;

export class TestD1Database {
  readonly db = new DatabaseSync(":memory:");

  constructor() {
    const migration = readFileSync("migrations/0001_initial.sql", "utf8");
    this.db.exec(migration);
  }

  prepare(sql: string) {
    const database = this.db;
    const statement = database.prepare(sql);
    let bound: BoundValue[] = [];
    const api = {
      bind(...values: BoundValue[]) {
        bound = values;
        return api;
      },
      async first<T = unknown>() {
        return statement.get(...bound) as T | null;
      },
      async all<T = unknown>() {
        return { results: statement.all(...bound) as T[] };
      },
      async raw<T = unknown[]>() {
        const columns = statement.columns().map((column) => column.name);
        const rows = statement.all(...bound) as Record<string, unknown>[];
        return rows.map((row) => columns.map((column) => row[column])) as T[];
      },
      async run() {
        statement.run(...bound);
        return { success: true, meta: {}, results: [] };
      },
    };
    return api;
  }

  async batch(statements: Array<ReturnType<TestD1Database["prepare"]>>) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

export function createTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: new TestD1Database() as unknown as D1Database,
    JOBS: {
      async send() {
        return undefined;
      },
    } as unknown as Queue,
    GITHUB_APP_ID: "0",
    GITHUB_APP_SLUG: "gittensory",
    GITTENSOR_REGISTRY_URL: "https://raw.githubusercontent.com/entrius/gittensor/test/gittensor/validator/weights/master_repositories.json",
    PUBLIC_API_ORIGIN: "http://localhost:8787",
    INTERNAL_JOB_TOKEN: "dev-internal-token",
    GITHUB_WEBHOOK_SECRET: "test-webhook-secret",
    GITHUB_APP_PRIVATE_KEY: "test-private-key",
    ...overrides,
  };
}
