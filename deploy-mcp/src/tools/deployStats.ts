import { z } from "zod";
import { openWorld } from "../world.js";
import { textResult, round, iso, HOUR_MS } from "../shared.js";
import { SCENARIO_NOW } from "../seed/scenario.js";

interface Agg {
  avgErrorRate: number | null;
  avgP99: number | null;
  requests: number | null;
  errors: number | null;
  samples: number;
}

export const deployStats = {
  name: "deploy_stats",
  config: {
    title: "Deploy stats",
    description:
      "Error-rate and latency aggregates for one deploy's service. " +
      "Mode 'pre-post' (default): window before vs window after deploy start. " +
      "Mode 'recent': last N hours from the latest available metric (includes recovery rows).",
    inputSchema: {
      id: z.string().describe("Deploy id"),
      windowHours: z.number().min(1).max(12).default(3).describe("Window size in hours"),
      mode: z.enum(["pre-post", "recent"]).default("pre-post").describe("pre-post: around deploy start; recent: trailing window from latest metric"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  handler: async (args: { id: string; windowHours?: number; mode?: "pre-post" | "recent" }) => {
    const db = openWorld({ readOnly: true });
    try {
      const dep = db.prepare(`SELECT * FROM deploys WHERE id = ?`).get(args.id) as
        | { service: string; started_at: string }
        | undefined;
      if (!dep) return textResult({ ok: false, error: `Deploy ${args.id} not found.` });

      const w = (args.windowHours ?? 3) * HOUR_MS;
      const start = Date.parse(dep.started_at);
      const mode = args.mode ?? "pre-post";

      const agg = (from: number, to: number): Agg =>
        db
          .prepare(
            `SELECT AVG(errors * 1.0 / NULLIF(requests, 0)) AS avgErrorRate,
                    AVG(p99_ms) AS avgP99,
                    SUM(requests) AS requests,
                    SUM(errors) AS errors,
                    COUNT(*) AS samples
               FROM metrics
              WHERE service = ? AND ts >= ? AND ts < ?`,
          )
          .get(dep.service, iso(from), iso(to)) as unknown as Agg;

      let pre: Agg, post: Agg;
      if (mode === "recent") {
        // Recent mode: use the latest metric timestamp as the anchor (includes recovery rows)
        const latestRow = db
          .prepare(`SELECT MAX(ts) AS max_ts FROM metrics WHERE service = ?`)
          .get(dep.service) as { max_ts: string } | undefined;
        const latestTs = latestRow?.max_ts ? Date.parse(latestRow.max_ts) : SCENARIO_NOW;
        const to = latestTs + HOUR_MS; // exclusive upper bound after latest bucket
        const from = to - w;
        pre = agg(from - w, from); // baseline window before recent
        post = agg(from, to);       // recent window (includes any recovery)
      } else {
        // Pre-post mode: anchored to deploy start
        pre = agg(start - w, start);
        post = agg(start, start + w);
      }

      return textResult({
        ok: true,
        deploy_id: args.id,
        service: dep.service,
        started_at: dep.started_at,
        window_hours: args.windowHours ?? 3,
        mode,
        pre: {
          avg_error_rate: round(pre.avgErrorRate),
          avg_p99_ms: round(pre.avgP99, 1),
          requests: pre.requests,
          errors: pre.errors,
          samples: pre.samples,
        },
        post: {
          avg_error_rate: round(post.avgErrorRate),
          avg_p99_ms: round(post.avgP99, 1),
          requests: post.requests,
          errors: post.errors,
          samples: post.samples,
        },
        delta_error_rate:
          pre.avgErrorRate !== null && post.avgErrorRate !== null
            ? round(post.avgErrorRate - pre.avgErrorRate)
            : null,
        delta_p99_ms:
          pre.avgP99 !== null && post.avgP99 !== null ? round(post.avgP99 - pre.avgP99, 1) : null,
      });
    } finally {
      db.close();
    }
  },
};