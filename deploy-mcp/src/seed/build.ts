import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync, rmSync, renameSync, copyFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { HOUR_MS, iso } from "../shared.js";
import { mulberry32, jitter, hex, SEED_NUMBER } from "./rng.js";
import {
  SCENARIO_NOW,
  WINDOW_HOURS,
  SERVICES,
  DEPLOY_PLAN,
  ALERT_PLAN,
  culpritStartMs,
} from "./scenario.js";

const SCHEMA = `
CREATE TABLE deploys (
  id TEXT PRIMARY KEY,
  service TEXT NOT NULL,
  version TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  status TEXT NOT NULL,
  rolled_back INTEGER NOT NULL DEFAULT 0,
  rolled_back_at TEXT,
  notes TEXT
);
CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  service TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE metrics (
  ts TEXT NOT NULL,
  service TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  requests INTEGER NOT NULL,
  errors INTEGER NOT NULL,
  p99_ms REAL NOT NULL
);
CREATE INDEX idx_metrics_lookup ON metrics (service, ts);
CREATE TABLE analysis_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  question TEXT NOT NULL,
  sql TEXT NOT NULL,
  result_json TEXT NOT NULL,
  summary TEXT NOT NULL
);
CREATE TABLE pr_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  branch TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL
);
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL
);
`;

export interface WorldStats {
  deploys: number;
  alerts: number;
  metrics: number;
}

/** Idempotent by construction: always rebuilds the same deterministic world. */
export function buildWorld(file: string): WorldStats {
  mkdirSync(path.dirname(file), { recursive: true });

  // Build into a temporary sibling file first, then atomically replace
  const tmpFile = `${file}.tmp`;
  if (existsSync(tmpFile)) rmSync(tmpFile);

  const db = new DatabaseSync(tmpFile);
  try {
    db.exec(SCHEMA);
    const rnd = mulberry32(SEED_NUMBER);

    db.exec("BEGIN");

    // --- deploys ---------------------------------------------------------------
    const versionCounters = new Map<string, number>();
    const insertDeploy = db.prepare(
      `INSERT INTO deploys (id, service, version, commit_sha, title, author, started_at, finished_at, status, rolled_back, rolled_back_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
    );
    for (const d of DEPLOY_PLAN) {
      const n = (versionCounters.get(d.service) ?? 0) + 1;
      versionCounters.set(d.service, n);
      const start = SCENARIO_NOW - d.hoursAgo * HOUR_MS;
      insertDeploy.run(
        d.id,
        d.service,
        `v2.${n}.0`,
        d.commit ?? hex(rnd, 7),
        d.title,
        d.author,
        iso(start),
        iso(start + 14 * 60_000),
        d.status ?? "succeeded",
        d.notes ?? null,
      );
    }

    // --- alerts ----------------------------------------------------------------
    const insertAlert = db.prepare(
      `INSERT INTO alerts (id, name, source, service, severity, title, status, created_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const a of ALERT_PLAN) {
      insertAlert.run(
        a.id,
        a.name,
        a.source,
        a.service,
        a.severity,
        a.title,
        a.status,
        iso(SCENARIO_NOW - a.hoursAgo * HOUR_MS + a.minuteOffset * 60_000),
        JSON.stringify(a.payload),
      );
    }

    // --- metrics (hourly buckets, ts = bucket start) ---------------------------
    const insertMetric = db.prepare(
      `INSERT INTO metrics (ts, service, endpoint, requests, errors, p99_ms) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (let h = WINDOW_HOURS; h >= 1; h--) {
      const ts = SCENARIO_NOW - h * HOUR_MS;
      for (const [service, p] of Object.entries(SERVICES)) {
        let err = p.err;
        let p99 = p.p99;

        if (service === "checkout-api") {
          if (ts === culpritStartMs) {
            err = 0.042; // partial bucket while the rollout completes
            p99 = 1300;
          } else if (ts > culpritStartMs) {
            err = jitter(rnd, 0.105, 0.15);
            p99 = jitter(rnd, 2700, 0.12);
          }
        } else if (service === "payment-gateway") {
          if (ts > culpritStartMs) {
            // cascade: checkout timeouts surface as payment failures ~1 bucket later
            err = jitter(rnd, 0.064, 0.15);
            p99 = jitter(rnd, 1150, 0.12);
          }
        } else if (service === "inventory-svc" && h >= 68 && h <= 70) {
          err = p.err * 3.2; // blip behind resolved alert alrt-0482
          p99 = p.p99 * 2.1;
        }

        const requests = Math.round(jitter(rnd, p.rph, 0.08));
        const errors = Math.max(0, Math.round(requests * err));
        insertMetric.run(iso(ts), service, p.endpoint, requests, errors, Math.round(p99 * 10) / 10);
      }
    }

    db.prepare(`INSERT INTO events (ts, kind, detail) VALUES (?, 'seed', ?)`).run(
      iso(SCENARIO_NOW),
      `deterministic world built — anchor ${iso(SCENARIO_NOW)}, seed 0x${SEED_NUMBER.toString(16)}`,
    );
    db.exec("COMMIT");

    const c = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
    const stats = { deploys: c("deploys"), alerts: c("alerts"), metrics: c("metrics") };

    // Validate the built world before replacing
    if (stats.deploys === 0 || stats.alerts === 0 || stats.metrics === 0) {
      throw new Error(`Validation failed: deploys=${stats.deploys} alerts=${stats.alerts} metrics=${stats.metrics}`);
    }

    db.close();

    // Cross-platform atomic replace:
    // - POSIX: rename() atomically overwrites destination
    // - Windows: rename() fails if destination exists; use copy+unlink with retry
    atomicReplace(tmpFile, file);

    return stats;
  } catch (err) {
    // Cleanup temp file on failure; original destination is untouched
    try {
      if (existsSync(tmpFile)) rmSync(tmpFile);
    } catch {
      /* ignore cleanup errors */
    }
    try {
      db.close();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/**
 * Atomically replace destination file with source file.
 * On POSIX: rename() is atomic and overwrites.
 * On Windows: rename() fails if destination exists; retry with copy+unlink.
 * Retries with backoff to handle brief file locks (e.g., antivirus, backup).
 */
function atomicReplace(src: string, dest: string): void {
  try {
    // Fast path: POSIX atomic rename
    renameSync(src, dest);
    return;
  } catch (err: any) {
    // On Windows, rename fails with EPERM/EBUSY if destination exists.
    // Also handle cross-device errors (EXDEV) which can happen on some setups.
    const isWindows = process.platform === "win32";
    const isRetryable = isWindows && (err.code === "EPERM" || err.code === "EBUSY" || err.code === "EACCES");

    if (!isRetryable) {
      // Non-retryable error (e.g., EXDEV cross-device, permissions)
      throw err;
    }
  }

  // Windows fallback: copy + unlink with retry/backoff
  // This handles the case where destination is briefly locked by another process.
  const maxRetries = 10;
  const baseDelayMs = 50;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Copy source to destination (overwrites on Windows)
      copyFileSync(src, dest);
      // Remove source
      unlinkSync(src);
      return;
    } catch (err: any) {
      lastError = err;
      // If destination is locked, wait and retry
      if (err.code === "EPERM" || err.code === "EBUSY" || err.code === "EACCES") {
        const delay = baseDelayMs * Math.pow(2, attempt); // exponential backoff
        // eslint-disable-next-line no-await-in-loop
        // Using synchronous sleep via Atomics.wait on a shared buffer
        const buffer = new Int32Array(new SharedArrayBuffer(4));
        Atomics.wait(buffer, 0, 0, delay);
        continue;
      }
      // Non-retryable error
      throw err;
    }
  }

  // All retries exhausted
  throw new Error(`atomicReplace failed after ${maxRetries} attempts: ${lastError?.message}`);
}