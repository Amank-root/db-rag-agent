export const HOUR_MS = 3_600_000;

export const iso = (ms: number): string => new Date(ms).toISOString();

export function round(n: number | null | undefined, digits = 6): number | null {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  const f = 10 ** digits;
  return Math.round((n as number) * f) / f;
}

/** Uniform MCP tool result: one JSON text block. */
export function textResult(payload: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}