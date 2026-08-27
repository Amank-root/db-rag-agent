import { test } from "node:test";
import assert from "node:assert/strict";
import { assertReadOnlySql, MAX_ROWS } from "../sql-guard.js";

test("allows plain SELECT and appends LIMIT", () => {
  const { normalized } = assertReadOnlySql("SELECT * FROM deploys");
  assert.match(normalized, new RegExp(`LIMIT ${MAX_ROWS}$`));
});

test("keeps existing LIMIT", () => {
  const { normalized } = assertReadOnlySql("SELECT * FROM deploys LIMIT 10");
  assert.equal(normalized, "SELECT * FROM deploys LIMIT 10");
});

test("allows WITH (read-only CTE)", () => {
  assert.doesNotThrow(() =>
    assertReadOnlySql("WITH x AS (SELECT 1 AS n) SELECT n FROM x"),
  );
});

test("rejects non-SELECT statements", () => {
  for (const sql of [
    "DELETE FROM deploys",
    "DROP TABLE metrics",
    "UPDATE deploys SET rolled_back = 1",
    "INSERT INTO events (ts) VALUES ('x')",
    "PRAGMA table_info(deploys)",
  ]) {
    assert.throws(() => assertReadOnlySql(sql));
  }
});

test("rejects write smuggled inside a CTE", () => {
  assert.throws(() =>
    assertReadOnlySql("WITH x AS (SELECT 1) INSERT INTO events (ts) SELECT * FROM x"),
  );
});

test("rejects multiple statements", () => {
  assert.throws(() => assertReadOnlySql("SELECT 1; DROP TABLE deploys"));
});

test("keywords inside string literals are not false positives", () => {
  assert.doesNotThrow(() =>
    assertReadOnlySql("SELECT * FROM alerts WHERE title LIKE '%DELETE%'"),
  );
});