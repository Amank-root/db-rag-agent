import { z } from "zod";
import { openWorld } from "../world.js";
import { textResult } from "../shared.js";

export const listDeploys = {
  name: "list_deploys",
  config: {
    title: "List deploys",
    description:
      "Deploy history from the simulated CD system: id, service, version, title, author, started_at, status, rolled_back.",
    inputSchema: {
      service: z.string().optional().describe("Filter by service name, e.g. checkout-api"),
      sinceHours: z
        .number()
        .int()
        .min(1)
        .max(336)
        .default(168)
        .describe("Look-back window in hours (default 168 = 7 days)"),
      limit: z.number().int().min(1).max(200).default(50),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  handler: async (args: { service?: string; sinceHours?: number; limit?: number }) => {
    const db = openWorld({ readOnly: true });
    try {
      const since = new Date(Date.now() - (args.sinceHours ?? 168) * 3_600_000).toISOString();
      const where = ["started_at >= ?"];
      const params: unknown[] = [since];
      if (args.service) {
        where.push("service = ?");
        params.push(args.service);
      }
      params.push(args.limit ?? 50);
      const rows = db
        .prepare(
          `SELECT id, service, version, title, author, started_at, finished_at, status, rolled_back
             FROM deploys WHERE ${where.join(" AND ")}
             ORDER BY started_at DESC LIMIT ?`,
        )
        .all(...(params as []));
      return textResult({ ok: true, count: rows.length, deploys: rows });
    } finally {
      db.close();
    }
  },
};