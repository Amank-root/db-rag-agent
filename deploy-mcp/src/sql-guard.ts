/**
 * Defense-in-depth for query_db: even though the connection opens read-only,
 * we validate the statement first so the agent gets a clear, actionable error.
 */
const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|SAVEPOINT|BEGIN|COMMIT|ROLLBACK|GRANT)\b/i;

export const MAX_ROWS = 500;

function maskLiterals(sql: string): { masked: string; literalRanges: Array<{ start: number; end: number }> } {
  const ranges: Array<{ start: number; end: number }> = [];
  const maskedChars: string[] = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
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
    } else {
      maskedChars.push(sql[i]);
      i++;
    }
  }
  return { masked: maskedChars.join(""), literalRanges: ranges };
}

function isInLiteral(pos: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((r) => pos >= r.start && pos < r.end);
}

export function assertReadOnlySql(sql: string): { normalized: string } {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!trimmed) throw new Error("Empty SQL statement.");
  if (trimmed.includes(";")) throw new Error("Only a single statement is allowed.");

  // Mask string literals to find real keywords
  const { masked, literalRanges } = maskLiterals(trimmed);

  if (!/^\s*(SELECT|WITH)\b/i.test(masked)) {
    throw new Error("Only read-only SELECT/WITH queries are allowed.");
  }
  const hit = masked.match(FORBIDDEN);
  if (hit && !isInLiteral(hit.index!, literalRanges)) {
    throw new Error(`Forbidden keyword in read-only query: ${hit[1].toUpperCase()}`);
  }

  // Enforce MAX_ROWS ceiling on the actual LIMIT clause (not in literals)
  const limitRegex = /\bLIMIT\s+(\d+)/gi;
  let match: RegExpExecArray | null;
  let realLimitMatch: { index: number; value: string; limit: number } | null = null;
  while ((match = limitRegex.exec(masked)) !== null) {
    if (!isInLiteral(match.index, literalRanges)) {
      realLimitMatch = { index: match.index, value: match[0], limit: parseInt(match[1], 10) };
    }
  }

  let normalized: string;
  if (realLimitMatch) {
    const cappedLimit = Math.min(realLimitMatch.limit, MAX_ROWS);
    if (realLimitMatch.limit > MAX_ROWS) {
      // Replace only the real LIMIT clause in the original SQL
      const idx = realLimitMatch.index;
      const len = realLimitMatch.value.length;
      normalized = trimmed.slice(0, idx) + `LIMIT ${cappedLimit}` + trimmed.slice(idx + len);
    } else {
      normalized = trimmed;
    }
  } else {
    normalized = `${trimmed}\nLIMIT ${MAX_ROWS}`;
  }
  return { normalized };
}