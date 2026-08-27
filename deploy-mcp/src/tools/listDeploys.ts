import { z } from "zod";
import { openWorld } from "../world.js";
import { textResult, iso, HOUR_MS } from "../shared.js";
import { SCENARIO_NOW } from "../seed/scenario.js";

type Params = (string | number | null)[];

export const listDeploys = {
  name: "list_deploys",
  config: {
    title: "List deploys",
    description:
      "Deploy history from the simulated CD system: id, service, version, title, author, started_at, status, rolled_back. Windowed against the scenario clock (frozen at 2026-08-27T14:00Z).",
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
      const since = iso(SCENARIO_NOW - (args.sinceHours ?? 168) * HOUR_MS);
      const where = ["started_at >= ?"];
      const params: Params = [since];
      if (args.service) {
        where.push("service = ?");
        params.push(args.service);
      }
      const limit = args.limit ?? 50;
      const rows = db
        .prepare(
          `SELECT id, service, version, title, author, started_at, finished_at, status, rolled_back
             FROM deploys WHERE ${where.join(" AND ")}
             ORDER BY started_at DESC LIMIT ?`,
        )
        .all(...params, limit);
      return textResult({ ok: true, count: rows.length, deploys: rows });
    } finally {
      db.close();
    }
  },
};