import { z } from "zod";
import { openWorld } from "../world.js";
import { textResult } from "../shared.js";

export const listAlerts = {
  name: "list_alerts",
  config: {
    title: "List alerts",
    description: "Simulated alert feed: id, name, source, service, severity, status, created_at, title.",
    inputSchema: {
      status: z.string().optional().describe("firing | resolved"),
      severity: z.string().optional().describe("critical | warning | info"),
      service: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  handler: async (args: { status?: string; severity?: string; service?: string }) => {
    const db = openWorld({ readOnly: true });
    try {
      const where: string[] = [];
      const params: unknown[] = [];
      for (const [col, val] of Object.entries(args)) {
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
        .all(...(params as []));
      return textResult({ ok: true, count: rows.length, alerts: rows });
    } finally {
      db.close();
    }
  },
};