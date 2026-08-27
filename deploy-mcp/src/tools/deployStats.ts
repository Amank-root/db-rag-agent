import { z } from "zod";
import { openWorld } from "../world.js";
import { textResult, round, iso, HOUR_MS } from "../shared.js";

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
      "Error-rate and latency aggregates for one deploy's service: window before vs window after it started. Facts only — the verdict is computed in the sandbox.",
    inputSchema: {
      id: z.string().describe("Deploy id"),
      windowHours: z.number().min(1).max(12).default(3).describe("Pre/post window size in hours"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  handler: async (args: { id: string; windowHours?: number }) => {
    const db = openWorld({ readOnly: true });
    try {
      const dep = db.prepare(`SELECT * FROM deploys WHERE id = ?`).get(args.id) as
        | { service: string; started_at: string }
        | undefined;
      if (!dep) return textResult({ ok: false, error: `Deploy ${args.id} not found.` });

      const w = (args.windowHours ?? 3) * HOUR_MS;
      const start = Date.parse(dep.started_at);
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
          .get(dep.service, iso(from), iso(to)) as Agg;

      const pre = agg(start - w, start);
      const post = agg(start, start + w);
      return textResult({
        ok: true,
        deploy_id: args.id,
        service: dep.service,
        started_at: dep.started_at,
        window_hours: (args.windowHours ?? 3),
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