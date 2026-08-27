import { z } from "zod";
import { openWorld } from "../world.js";
import { textResult } from "../shared.js";

type Params = (string | number | null)[];

/** Whitelisted filters — arg key → column name (never interpolate raw input). */
const FILTER_COLUMNS = {
  status: "status",
  severity: "severity",
  service: "service",
} as const;

export const listAlerts = {
  name: "list_alerts",
  config: {
    title: "List alerts",
    description:
      "Simulated alert feed: id, name, source, service, severity, status, created_at, title.",
    inputSchema: {
      status: z.string().optional().describe("firing | resolved"),
      severity: z.string().optional().describe("critical | warning | info"),
      service: z.string().optional().describe("Filter by service name"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  handler: async (args: { status?: string; severity?: string; service?: string }) => {
    const db = openWorld({ readOnly: true });
    try {
      const where: string[] = [];
      const params: Params = [];
      for (const [key, col] of Object.entries(FILTER_COLUMNS)) {
        const val = args[key as keyof typeof FILTER_COLUMNS];
        if (val) {
          where.push(`${col} = ?`);
          params.push(val);
        }
      }
      const rows = db
        .prepare(
          `SELECT id, name, source, service, severity, status, created_at, title
             FROM alerts ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
             ORDER BY created_at DESC`,
        )
        .all(...params);
      return textResult({ ok: true, count: rows.length, alerts: rows });
    } finally {
      db.close();
    }
  },
};