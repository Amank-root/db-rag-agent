import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { buildWorld } from "../seed/build.js";

const tmp = () =>
  path.join(fs.mkdtempSync(path.join(os.tmpdir(), "d2-")), "world.sqlite");

function dump(file: string): string {
  const db = new DatabaseSync(file, { readOnly: true });
  const out = {
    deploys: db.prepare(`SELECT * FROM deploys ORDER BY id`).all(),
    alerts: db.prepare(`SELECT * FROM alerts ORDER BY id`).all(),
    metrics: db.prepare(`SELECT * FROM metrics ORDER BY ts, service`).all(),
    events: db.prepare(`SELECT * FROM events ORDER BY id`).all(),
  };
  db.close();
  return JSON.stringify(out);
}

test("seed is deterministic: two builds produce identical worlds", () => {
  const a = tmp();
  const b = tmp();
  buildWorld(a);
  buildWorld(b);
  assert.equal(dump(a), dump(b));
  fs.rmSync(path.dirname(a), { recursive: true, force: true });
  fs.rmSync(path.dirname(b), { recursive: true, force: true });
});

test("culprit dep-4c21 exists and its metrics spike is detectable", () => {
  const f = tmp();
  buildWorld(f);
  const db = new DatabaseSync(f, { readOnly: true });
  const dep = db.prepare(`SELECT * FROM deploys WHERE id = 'dep-4c21'`).get() as {
    service: string;
    started_at: string;
  };
  assert.ok(dep, "culprit deploy exists");
  const start = dep.started_at;
  const agg = (cond: string) =>
    (
      db
        .prepare(
          `SELECT AVG(errors * 1.0 / NULLIF(requests, 0)) AS er FROM metrics
            WHERE service = ? AND ts ${cond} ?`,
        )
        .get(dep.service, start) as { er: number }
    ).er;
  const pre = agg("<");
  const post = agg(">=");
  assert.ok(post > 5 * pre, `post (${post}) should be >5x pre (${pre})`);
  db.close();
  fs.rmSync(path.dirname(f), { recursive: true, force: true });
});

test("payment-failures alert is firing", () => {
  const f = tmp();
  buildWorld(f);
  const db = new DatabaseSync(f, { readOnly: true });
  const row = db
    .prepare(`SELECT status, severity FROM alerts WHERE name = 'payment-failures'`)
    .get() as { status: string; severity: string };
  assert.equal(row.status, "firing");
  assert.equal(row.severity, "critical");
  db.close();
  fs.rmSync(path.dirname(f), { recursive: true, force: true });
});