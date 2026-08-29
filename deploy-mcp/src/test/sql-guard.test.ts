import { test } from "node:test";
import assert from "node:assert/strict";
import { assertReadOnlySql, MAX_ROWS } from "../sql-guard.js";

test("allows plain SELECT and appends LIMIT", () => {
  const { normalized } = assertReadOnlySql("SELECT * FROM deploys");
  assert.match(normalized, new RegExp(`LIMIT ${MAX_ROWS}$`));
});

test("keeps existing LIMIT under ceiling", () => {
  const { normalized } = assertReadOnlySql("SELECT * FROM deploys LIMIT 10");
  assert.equal(normalized, "SELECT * FROM deploys LIMIT 10");
});

test("caps LIMIT at MAX_ROWS ceiling", () => {
  const { normalized } = assertReadOnlySql(`SELECT * FROM deploys LIMIT ${MAX_ROWS + 100}`);
  assert.match(normalized, new RegExp(`LIMIT ${MAX_ROWS}$`));
});

test("caps LIMIT at MAX_ROWS even with large value", () => {
  const { normalized } = assertReadOnlySql("SELECT * FROM deploys LIMIT 10000");
  assert.match(normalized, new RegExp(`LIMIT ${MAX_ROWS}$`));
});

test("does not cap LIMIT inside string literal", () => {
  // The literal 'LIMIT 10000' should not be mistaken for a real LIMIT clause
  const { normalized } = assertReadOnlySql("SELECT * FROM alerts WHERE title LIKE '%LIMIT 10000%'");
  // Should append LIMIT 500 since there's no real LIMIT clause
  assert.match(normalized, new RegExp(`LIMIT ${MAX_ROWS}$`));
});

test("caps real LIMIT even when literal LIMIT appears earlier", () => {
  // Real LIMIT 10000 should be capped to 500, literal 'LIMIT 99999' should be preserved
  const { normalized } = assertReadOnlySql("SELECT * FROM deploys WHERE note = 'LIMIT 99999' LIMIT 10000");
  // Real LIMIT clause should be capped
  assert.match(normalized, new RegExp(`LIMIT ${MAX_ROWS}$`));
  // Literal should be preserved
  assert.ok(normalized.includes("'LIMIT 99999'"), "String literal should be preserved");
});

test("masks LIMIT inside line comment", () => {
  // LIMIT in -- comment should not be mistaken for real LIMIT
  const { normalized } = assertReadOnlySql("SELECT * FROM deploys -- LIMIT 10000");
  assert.match(normalized, new RegExp(`LIMIT ${MAX_ROWS}$`));
});

test("masks LIMIT inside block comment", () => {
  // LIMIT in /* comment */ should not be mistaken for real LIMIT
  const { normalized } = assertReadOnlySql("SELECT * FROM deploys /* LIMIT 10000 */");
  assert.match(normalized, new RegExp(`LIMIT ${MAX_ROWS}$`));
});

test("real LIMIT after comment is capped, comment LIMIT preserved", () => {
  // Real LIMIT after comment should be capped, comment LIMIT remains as comment text
  const { normalized } = assertReadOnlySql("SELECT * FROM deploys -- LIMIT 10000\nLIMIT 10000");
  // The real LIMIT should be capped
  assert.match(normalized, new RegExp(`LIMIT ${MAX_ROWS}`));
  // The comment LIMIT should still be in the comment
  assert.ok(normalized.includes("-- LIMIT 10000"), "Comment should be preserved");
  // Should have two LIMIT occurrences: one in comment, one real (capped)
  const limitCount = (normalized.match(/LIMIT/gi) || []).length;
  assert.equal(limitCount, 2, "Should have LIMIT in comment + capped real LIMIT");
});

test("handles LIMIT count OFFSET offset", () => {
  const { normalized } = assertReadOnlySql("SELECT * FROM deploys LIMIT 100 OFFSET 50");
  assert.equal(normalized, "SELECT * FROM deploys LIMIT 100 OFFSET 50");
});

test("caps LIMIT count OFFSET offset when count exceeds ceiling", () => {
  const { normalized } = assertReadOnlySql("SELECT * FROM deploys LIMIT 1000 OFFSET 200");
  assert.match(normalized, /LIMIT 500 OFFSET 200$/);
});

test("caps OFFSET when it exceeds ceiling", () => {
  const { normalized } = assertReadOnlySql("SELECT * FROM deploys LIMIT 100 OFFSET 1000");
  assert.match(normalized, /LIMIT 100 OFFSET 500$/);
});

test("handles LIMIT offset, count (comma form)", () => {
  const { normalized } = assertReadOnlySql("SELECT * FROM deploys LIMIT 50, 100");
  assert.equal(normalized, "SELECT * FROM deploys LIMIT 50, 100");
});

test("caps LIMIT offset, count (comma form) when count exceeds ceiling", () => {
  const { normalized } = assertReadOnlySql("SELECT * FROM deploys LIMIT 50, 1000");
  assert.match(normalized, /LIMIT 50, 500$/);
});

test("caps OFFSET in comma form when it exceeds ceiling", () => {
  const { normalized } = assertReadOnlySql("SELECT * FROM deploys LIMIT 1000, 100");
  assert.match(normalized, /LIMIT 500, 100$/);
});

test("allows WITH (read-only CTE)", () => {
  assert.doesNotThrow(() => assertReadOnlySql("WITH x AS (SELECT 1 AS n) SELECT n FROM x"));
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