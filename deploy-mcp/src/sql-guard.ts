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

  // Enforce MAX_ROWS ceiling on the actual LIMIT clause (not in literals/comments)
  // Handle SQLite LIMIT syntax:
  //   LIMIT count
  //   LIMIT count OFFSET offset
  //   LIMIT offset, count  (comma form - first is offset, second is count)
  const limitRegex = /\bLIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+)|,\s*(\d+))?/gi;
  let match: RegExpExecArray | null;
  let realLimitMatch: { index: number; value: string; count: number; offset?: number; hasOffset: boolean; isCommaForm: boolean } | null = null;
  while ((match = limitRegex.exec(masked)) !== null) {
    if (!isInRange(match.index, ranges)) {
      // match[1] = first number (count for OFFSET form, offset for comma form)
      // match[2] = OFFSET offset (when OFFSET form)
      // match[3] = count (when comma form)
      const firstNum = parseInt(match[1], 10);
      const offset = match[2] ? parseInt(match[2], 10) : undefined;
      const commaCount = match[3] ? parseInt(match[3], 10) : undefined;
      realLimitMatch = {
        index: match.index,
        value: match[0],
        count: commaCount ?? firstNum,
        offset: match[2] ? offset : (commaCount !== undefined ? firstNum : undefined),
        hasOffset: !!match[2] || !!match[3],
        isCommaForm: !!match[3],
      };
    }
  }

  let normalized: string;
  if (realLimitMatch) {
    const cappedCount = Math.min(realLimitMatch.count, MAX_ROWS);
    // Also cap offset if it exceeds ceiling
    const cappedOffset = realLimitMatch.offset !== undefined ? Math.min(realLimitMatch.offset, MAX_ROWS) : undefined;
    const countExceeds = realLimitMatch.count > MAX_ROWS;
    const offsetExceeds = realLimitMatch.offset !== undefined && realLimitMatch.offset > MAX_ROWS;
    if (countExceeds || offsetExceeds) {
      // Replace only the real LIMIT clause in the original SQL
      const idx = realLimitMatch.index;
      const len = realLimitMatch.value.length;
      let replacement: string;
      if (realLimitMatch.isCommaForm) {
        // LIMIT offset, count -> LIMIT cappedOffset, cappedCount
        const offset = cappedOffset!;
        replacement = `LIMIT ${offset}, ${cappedCount}`;
      } else if (realLimitMatch.hasOffset) {
        // LIMIT count OFFSET offset -> LIMIT cappedCount OFFSET cappedOffset
        replacement = `LIMIT ${cappedCount} OFFSET ${cappedOffset}`;
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