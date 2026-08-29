/**
 * Defense-in-depth for query_db: even though the connection opens read-only,
 * we validate the statement first so the agent gets a clear, actionable error.
 */
const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|SAVEPOINT|BEGIN|COMMIT|ROLLBACK|GRANT)\b/i;

export const MAX_ROWS = 500;

export function assertReadOnlySql(sql: string): { normalized: string } {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!trimmed) throw new Error("Empty SQL statement.");
  if (trimmed.includes(";")) throw new Error("Only a single statement is allowed.");

  // Blank out string literals so keywords inside data don't false-positive,
  // and smuggled statements inside literals don't false-negative.
  const noStrings = trimmed
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');

  if (!/^\s*(SELECT|WITH)\b/i.test(noStrings)) {
    throw new Error("Only read-only SELECT/WITH queries are allowed.");
  }
  const hit = noStrings.match(FORBIDDEN);
  if (hit) {
    throw new Error(`Forbidden keyword in read-only query: ${hit[1].toUpperCase()}`);
  }

  // Enforce MAX_ROWS ceiling on any LIMIT clause
  const limitMatch = noStrings.match(/\bLIMIT\s+(\d+)/i);
  let normalized: string;
  if (limitMatch) {
    const requestedLimit = parseInt(limitMatch[1], 10);
    const cappedLimit = Math.min(requestedLimit, MAX_ROWS);
    if (requestedLimit > MAX_ROWS) {
      // Replace the LIMIT value with capped value
      normalized = trimmed.replace(/\bLIMIT\s+\d+/i, `LIMIT ${cappedLimit}`);
    } else {
      normalized = trimmed;
    }
  } else {
    normalized = `${trimmed}\nLIMIT ${MAX_ROWS}`;
  }
  return { normalized };
}