/**
 * Defense-in-depth for query_db: even though the connection opens read-only,
 * we validate the statement first so the agent gets a clear, actionable error.
 */
const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|SAVEPOINT|BEGIN|COMMIT|ROLLBACK|GRANT)\b/i;

export const MAX_ROWS = 500;

function maskLiteralsAndComments(sql: string): { masked: string; ranges: Array<{ start: number; end: number }> } {
  const ranges: Array<{ start: number; end: number }> = [];
  const maskedChars: string[] = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    // String literals
    if (ch === "'" || ch === '"') {
      const quote = ch;
      const start = i;
      maskedChars.push(ch); // opening quote
      i++;
      while (i < sql.length) {
        if (sql[i] === quote) {
          if (i + 1 < sql.length && sql[i + 1] === quote) {
            // escaped quote - copy both
            maskedChars.push(sql[i]);
            maskedChars.push(sql[i + 1]);
            i += 2;
          } else {
            // closing quote
            maskedChars.push(sql[i]);
            i++;
            break;
          }
        } else {
          // Inside literal - replace with space to mask keywords but keep length
          maskedChars.push(" ");
          i++;
        }
      }
      ranges.push({ start, end: i });
    }
    // Line comments (-- until end of line)
    else if (ch === "-" && i + 1 < sql.length && sql[i + 1] === "-") {
      const start = i;
      maskedChars.push("-");
      maskedChars.push("-");
      i += 2;
      while (i < sql.length && sql[i] !== "\n" && sql[i] !== "\r") {
        maskedChars.push(" ");
        i++;
      }
      ranges.push({ start, end: i });
    }
    // Block comments (/* ... */)
    else if (ch === "/" && i + 1 < sql.length && sql[i + 1] === "*") {
      const start = i;
      maskedChars.push("/");
      maskedChars.push("*");
      i += 2;
      while (i < sql.length) {
        if (sql[i] === "*" && i + 1 < sql.length && sql[i + 1] === "/") {
          maskedChars.push("*");
          maskedChars.push("/");
          i += 2;
          break;
        } else {
          maskedChars.push(" ");
          i++;
        }
      }
      ranges.push({ start, end: i });
    }
    else {
      maskedChars.push(sql[i]);
      i++;
    }
  }
  return { masked: maskedChars.join(""), ranges };
}

function isInRange(pos: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((r) => pos >= r.start && pos < r.end);
}

/**
 * Find the outermost LIMIT clause in a SQL statement.
 * Tracks parenthesis depth to ignore LIMIT clauses inside CTEs, subqueries, etc.
 * Returns the match for the LIMIT at depth 0, or null if none found.
 */
function findOuterLimit(masked: string, ranges: Array<{ start: number; end: number }>): { index: number; value: string; count: number; offset?: number; hasOffset: boolean; isCommaForm: boolean } | null {
  const limitRegex = /\bLIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+)|,\s*(\d+))?/gi;
  let match: RegExpExecArray | null;
  let depth = 0;
  let lastPos = 0;

  // Pre-compute parenthesis depth at each position for efficiency
  // We only care about '(' and ')' outside masked ranges
  const depthAt = new Array(masked.length).fill(0);
  let currentDepth = 0;
  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i];
    const inMasked = isInRange(i, ranges);
    if (!inMasked) {
      if (ch === "(") currentDepth++;
      else if (ch === ")") currentDepth = Math.max(0, currentDepth - 1);
    }
    depthAt[i] = currentDepth;
  }

  let outerLimitMatch: { index: number; value: string; count: number; offset?: number; hasOffset: boolean; isCommaForm: boolean } | null = null;

  while ((match = limitRegex.exec(masked)) !== null) {
    if (!isInRange(match.index, ranges) && depthAt[match.index] === 0) {
      // match[1] = first number (count for OFFSET form, offset for comma form)
      // match[2] = OFFSET offset (when OFFSET form)
      // match[3] = count (when comma form)
      const firstNum = parseInt(match[1], 10);
      const offset = match[2] ? parseInt(match[2], 10) : undefined;
      const commaCount = match[3] ? parseInt(match[3], 10) : undefined;
      outerLimitMatch = {
        index: match.index,
        value: match[0],
        count: commaCount ?? firstNum,
        offset: match[2] ? offset : (commaCount !== undefined ? firstNum : undefined),
        hasOffset: !!match[2] || !!match[3],
        isCommaForm: !!match[3],
      };
      // We want the LAST outer LIMIT (rightmost at depth 0)
      // Continue searching in case there's another at depth 0
    }
  }

  return outerLimitMatch;
}

export function assertReadOnlySql(sql: string): { normalized: string } {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!trimmed) throw new Error("Empty SQL statement.");
  if (trimmed.includes(";")) throw new Error("Only a single statement is allowed.");

  // Mask string literals and comments to find real keywords
  const { masked, ranges } = maskLiteralsAndComments(trimmed);

  if (!/^\s*(SELECT|WITH)\b/i.test(masked)) {
    throw new Error("Only read-only SELECT/WITH queries are allowed.");
  }
  const hit = masked.match(FORBIDDEN);
  if (hit && !isInRange(hit.index!, ranges)) {
    throw new Error(`Forbidden keyword in read-only query: ${hit[1].toUpperCase()}`);
  }

  // Enforce MAX_ROWS ceiling on the actual OUTER LIMIT clause (not in literals/comments/subqueries)
  // Handle SQLite LIMIT syntax:
  //   LIMIT count
  //   LIMIT count OFFSET offset
  //   LIMIT offset, count  (comma form - first is offset, second is count)
  const realLimitMatch = findOuterLimit(masked, ranges);

  let normalized: string;
  if (realLimitMatch) {
    const cappedCount = Math.min(realLimitMatch.count, MAX_ROWS);
    // OFFSET is preserved as-is; it does not increase returned row count.
    // Only the LIMIT count (the number of rows returned) is capped at MAX_ROWS.
    const countExceeds = realLimitMatch.count > MAX_ROWS;
    if (countExceeds) {
      // Replace only the real LIMIT clause in the original SQL
      const idx = realLimitMatch.index;
      const len = realLimitMatch.value.length;
      let replacement: string;
      if (realLimitMatch.isCommaForm) {
        // LIMIT offset, count -> LIMIT offset, cappedCount (offset preserved)
        const offset = realLimitMatch.offset!;
        replacement = `LIMIT ${offset}, ${cappedCount}`;
      } else if (realLimitMatch.hasOffset) {
        // LIMIT count OFFSET offset -> LIMIT cappedCount OFFSET offset (offset preserved)
        replacement = `LIMIT ${cappedCount} OFFSET ${realLimitMatch.offset}`;
      } else {
        // LIMIT count
        replacement = `LIMIT ${cappedCount}`;
      }
      normalized = trimmed.slice(0, idx) + replacement + trimmed.slice(idx + len);
    } else {
      normalized = trimmed;
    }
  } else {
    normalized = `${trimmed}\nLIMIT ${MAX_ROWS}`;
  }
  return { normalized };
}