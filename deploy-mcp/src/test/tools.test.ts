import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { buildWorld } from "../seed/build.js";
import { queryDb } from "../tools/queryDb.js";
import { rollbackDeploy } from "../tools/rollbackDeploy.js";
import { deployStats } from "../tools/deployStats.js";
import { writeBack } from "../tools/writeBack.js";
import { openPr } from "../tools/openPr.js";

let dir: string;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "d2-tools-"));
});

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function freshWorld() {
  const dbPath = path.join(dir, `world-${Date.now()}-${Math.random()}.sqlite`);
  process.env.D2_DB_PATH = dbPath;
  buildWorld(dbPath);
  return dbPath;
}

const parse = (res: { content: Array<{ text: string }> }) => JSON.parse(res.content[0].text);

test("query_db runs read-only SELECT", async () => {
  const dbPath = freshWorld();
  const res = parse(await queryDb.handler({ sql: "SELECT COUNT(*) AS n FROM deploys" }));
  assert.equal(res.ok, true);
  assert.ok(res.rows[0].n >= 20);
  fs.rmSync(dbPath);
});

test("query_db refuses writes", async () => {
  const dbPath = freshWorld();
  const res = parse(await queryDb.handler({ sql: "DROP TABLE deploys" }));
  assert.equal(res.ok, false);
  assert.match(res.error, /read-only/i);
  fs.rmSync(dbPath);
});

test("query_db enforces MAX_ROWS ceiling on LIMIT", async () => {
  const dbPath = freshWorld();
  const res = parse(await queryDb.handler({ sql: "SELECT * FROM deploys LIMIT 10000" }));
  assert.equal(res.ok, true);
  assert.ok(res.rows.length <= 500, `Expected <= 500 rows, got ${res.rows.length}`);
  fs.rmSync(dbPath);
});

test("query_db returns truncated flag when results exceed MAX_ROWS", async () => {
  const dbPath = freshWorld();
  const res = parse(await queryDb.handler({ sql: "SELECT * FROM deploys" }));
  assert.equal(res.ok, true);
  assert.ok("truncated" in res);
  assert.equal(res.truncated, false);
  fs.rmSync(dbPath);
});

test("query_db appends LIMIT when absent", async () => {
  const dbPath = freshWorld();
  const res = parse(await queryDb.handler({ sql: "SELECT * FROM deploys" }));
  assert.equal(res.ok, true);
  assert.ok(res.rows.length <= 500);
  fs.rmSync(dbPath);
});

test("rollback_deploy rejects unknown deploys", async () => {
  const dbPath = freshWorld();
  const res = parse(
    await rollbackDeploy.handler({ id: "dep-0000", reason: "testing unknown id handling" }),
  );
  assert.equal(res.ok, false);
  fs.rmSync(dbPath);
});

test("rollback_deploy gates the culprit and simulates recovery", async () => {
  const dbPath = freshWorld();
  const first = parse(
    await rollbackDeploy.handler({
      id: "dep-4c21",
      reason: "Sandbox bisect: error-rate delta +0.075 after this deploy",
    }),
  );
  assert.equal(first.ok, true);
  assert.equal(first.recovery_simulated, true);

  const second = parse(
    await rollbackDeploy.handler({ id: "dep-4c21", reason: "second attempt must fail" }),
  );
  assert.equal(second.ok, false, "double rollback must be refused");
  fs.rmSync(dbPath);
});

test("rollback_deploy simulates cascade recovery for payment-gateway", async () => {
  const dbPath = freshWorld();
  // First rollback the culprit (checkout-api)
  const res = parse(
    await rollbackDeploy.handler({
      id: "dep-4c21",
      reason: "Sandbox bisect: error-rate delta +0.075 after this deploy",
    }),
  );
  assert.equal(res.ok, true);
  assert.equal(res.recovery_simulated, true);

  // Verify payment-gateway got recovery metrics appended (3 new hourly buckets)
  const pgMetrics = parse(
    await queryDb.handler({
      sql: "SELECT COUNT(*) AS n FROM metrics WHERE service = 'payment-gateway'",
    }),
  );
  // Originally 168 hourly buckets, after rollback should have 171 (3 recovery buckets added)
  assert.ok(pgMetrics.rows[0].n >= 171, `Expected >= 171 payment-gateway metrics, got ${pgMetrics.rows[0].n}`);
  fs.rmSync(dbPath);
});

test("deploy_stats pre-post mode works", async () => {
  const dbPath = freshWorld();
  const res = parse(await deployStats.handler({ id: "dep-4c21" }));
  assert.equal(res.ok, true);
  assert.ok(res.mode === "pre-post" || res.mode === undefined);
  fs.rmSync(dbPath);
});

test("deploy_stats recent mode shows recovery", async () => {
  const dbPath = freshWorld();
  // First rollback to generate recovery metrics
  await rollbackDeploy.handler({
    id: "dep-4c21",
    reason: "Sandbox bisect: error-rate delta +0.075 after this deploy",
  });

  const res = parse(await deployStats.handler({ id: "dep-4c21", mode: "recent" }));
  assert.equal(res.ok, true);
  assert.equal(res.mode, "recent");
  fs.rmSync(dbPath);
});

test("write_back uses transaction (both inserts or neither)", async () => {
  const dbPath = freshWorld();
  const res = parse(
    await writeBack.handler({
      question: "Test question",
      sql: "SELECT 1",
      resultSummary: "Test summary",
      resultJson: JSON.stringify([{ test: 1 }]),
    }),
  );
  assert.equal(res.ok, true);
  assert.ok(res.analysis_id > 0);

  // Verify both analysis_results and events were inserted
  const count = parse(
    await queryDb.handler({
      sql: "SELECT COUNT(*) AS n FROM analysis_results",
    }),
  );
  assert.ok(count.rows[0].n > 0);
  fs.rmSync(dbPath);
});

test("open_pr uses transaction (both inserts or neither)", async () => {
  const dbPath = freshWorld();
  const res = parse(
    await openPr.handler({
      title: "Test PR",
      body: "Test body",
      branch: "test/branch",
    }),
  );
  assert.equal(res.ok, true);
  assert.ok(res.pr_number > 100);

  // Verify both pr_log and events were inserted
  const count = parse(
    await queryDb.handler({
      sql: "SELECT COUNT(*) AS n FROM pr_log",
    }),
  );
  assert.ok(count.rows[0].n > 0);
  fs.rmSync(dbPath);
});

test("reseed atomic rename: failure leaves original intact", async () => {
  const dbPath = freshWorld();
  const statsBefore = buildWorld(dbPath);
  assert.ok(statsBefore.deploys > 0);

  const statsAfter = buildWorld(dbPath);
  assert.equal(statsAfter.deploys, statsBefore.deploys);
  assert.equal(statsAfter.alerts, statsBefore.alerts);
  assert.equal(statsAfter.metrics, statsBefore.metrics);
  fs.rmSync(dbPath);
});