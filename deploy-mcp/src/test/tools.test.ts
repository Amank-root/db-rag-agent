import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { buildWorld } from "../seed/build.js";
import { queryDb } from "../tools/queryDb.js";
import { rollbackDeploy } from "../tools/rollbackDeploy.js";

let dir: string;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "d2-tools-"));
  process.env.D2_DB_PATH = path.join(dir, "world.sqlite");
  buildWorld(process.env.D2_DB_PATH);
});

after(() => {
  delete process.env.D2_DB_PATH;
  fs.rmSync(dir, { recursive: true, force: true });
});

const parse = (res: { content: Array<{ text: string }> }) => JSON.parse(res.content[0].text);

test("query_db runs read-only SELECT", async () => {
  const res = parse(await queryDb.handler({ sql: "SELECT COUNT(*) AS n FROM deploys" }));
  assert.equal(res.ok, true);
  assert.ok(res.rows[0].n >= 20);
});

test("query_db refuses writes", async () => {
  const res = parse(await queryDb.handler({ sql: "DROP TABLE deploys" }));
  assert.equal(res.ok, false);
  assert.match(res.error, /read-only/i);
});

test("rollback_deploy rejects unknown deploys", async () => {
  const res = parse(
    await rollbackDeploy.handler({ id: "dep-0000", reason: "testing unknown id handling" }),
  );
  assert.equal(res.ok, false);
});

test("rollback_deploy gates the culprit and simulates recovery", async () => {
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
});