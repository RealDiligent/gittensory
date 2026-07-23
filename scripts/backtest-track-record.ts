#!/usr/bin/env node
// Read-only ORB D1 → REGRESSED-verdict track-record summary (#8140, epic #8082). Queries audit_events for
// the `calibration.threshold_backtest_run` rows #8138's persistThresholdBacktestRuns wrote (no writes),
// reconstructs each run's BacktestComparison from `metadata_json.comparison`, runs
// computeRegressedVerdictTrackRecord, and prints the summary #8105's merge-gating decision needs. The pure
// aggregation lives in packages/loopover-engine (unit-tested); this file is the thin IO wrapper — mirrors
// backtest-corpus-export.ts / export-d1-data.ts exactly (read + pure call + print, no logic of its own).
//
//   tsx scripts/backtest-track-record.ts [--remote] [--since-date <iso>] [--db loopover]
//
// --remote reads the deployed D1 (default is the local miniflare DB). --since-date bounds the window (rows
// whose created_at is >= the date); omit it for the full history. NEVER pass a write command. ORB only.
import { spawnSync } from "node:child_process";
import { computeRegressedVerdictTrackRecord, type BacktestComparison } from "@loopover/engine";

type D1Row = Record<string, unknown>;

type Args = {
  remote: boolean;
  sinceDate: string | undefined;
  db: string;
};

// Mirrors src/services/threshold-backtest-run.ts's THRESHOLD_BACKTEST_EVENT_TYPE — keep in sync with that
// writer; do not import it (private to the live ORB path; this CLI is a read-only reporting path, the same
// keep-in-sync stance backtest-corpus-export.ts takes toward signal-tracking-wire's event-type prefixes).
const THRESHOLD_BACKTEST_EVENT_TYPE = "calibration.threshold_backtest_run";

function parseArgs(argv: string[]): Args {
  const args: Args = { remote: false, sinceDate: undefined, db: "loopover" };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--remote") args.remote = true;
    else if (flag === "--since-date") args.sinceDate = argv[++i];
    else if (flag === "--db") args.db = argv[++i]!;
  }
  return args;
}

// Run a read-only SQL statement via wrangler and return the result rows. Throws on any wrangler failure so a
// partial/garbled read can never be mistaken for a complete history. Mirrors backtest-corpus-export.ts's d1Query.
function d1Query(db: string, remote: boolean, sql: string): D1Row[] {
  const result = spawnSync("npx", ["wrangler", "d1", "execute", db, remote ? "--remote" : "--local", "--json", "--command", sql], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`wrangler d1 execute failed (${result.status}): ${(result.stderr || result.stdout || "").slice(0, 500)}`);
  }
  const parsed = JSON.parse(result.stdout);
  // wrangler returns [{ results: [...], success, meta }] (one entry per statement).
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  return first?.results ?? [];
}

function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function parseMetadataJson(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    /* corrupt row -- fail open to {} (mirrors backtest-corpus-export.ts) */
  }
  return {};
}

function rowComparison(row: D1Row): BacktestComparison | null {
  const comparison = parseMetadataJson(row.metadata_json).comparison;
  if (!comparison || typeof comparison !== "object" || Array.isArray(comparison)) return null;
  return comparison as BacktestComparison;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const since = args.sinceDate ? ` AND created_at >= ${sqlStringLiteral(args.sinceDate)}` : "";
  const rows = d1Query(
    args.db,
    args.remote,
    `SELECT metadata_json FROM audit_events WHERE event_type = ${sqlStringLiteral(THRESHOLD_BACKTEST_EVENT_TYPE)}${since} ORDER BY created_at ASC`,
  );
  const comparisons = rows.map(rowComparison).filter((comparison): comparison is BacktestComparison => comparison !== null);
  const summary = computeRegressedVerdictTrackRecord(comparisons);

  console.log(`Backtest CI track record (${THRESHOLD_BACKTEST_EVENT_TYPE})`);
  console.log(`  total runs:     ${summary.totalRuns}`);
  console.log(`  regressed runs: ${summary.regressedRuns}`);
  console.log(`  regressed rate: ${summary.regressedRate === null ? "N/A (no runs recorded yet)" : summary.regressedRate.toFixed(4)}`);
  for (const [ruleId, counts] of summary.perRule) {
    console.log(`  ${ruleId}: total=${counts.total} regressed=${counts.regressed} improved=${counts.improved} unchanged=${counts.unchanged}`);
  }
}

main();
