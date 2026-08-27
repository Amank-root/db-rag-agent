import { z } from "zod";
import { openWorld } from "../world.js";
import { textResult, iso, HOUR_MS, round } from "../shared.js";

export const rollbackDeploy = {
  name: "rollback_deploy",
  config: {
    title: "Rollback deploy (IRREVERSIBLE)",
    description:
      "Marks a deploy rolled back and simulates recovery metrics. IRREVERSIBLE — approval-gated by " +
      "TrueForge. The agent MUST present findings and wait for explicit human approval before calling this.",
    inputSchema: {
      id: z.string().describe("Deploy id to roll back"),
      reason: z
        .string()
        .min(10)
        .describe("Evidence-based justification shown to the approver"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  handler: async (args: { id: string; reason: string }) => {
    const db = openWorld();
    try {
      const dep = db.prepare(`SELECT * FROM deploys WHERE id = ?`).get(args.id) as
        | { id: string; service: string; rolled_back: number }
        | undefined;
      if (!dep) return textResult({ ok: false, error: `Deploy ${args.id} not found.` });
      if (dep.rolled_back) {
        return textResult({ ok: false, error: `Deploy ${args.id} is already rolled back.` });
      }

      const now = new Date().toISOString();
      db.exec("BEGIN");
      db.prepare(
        `UPDATE deploys SET rolled_back = 1, rolled_back_at = ?, status = 'rolled_back' WHERE id = ?`,
      ).run(now, args.id);
      db.prepare(`INSERT INTO events (ts, kind, detail) VALUES (?, 'rollback', ?)`).run(
        now,
        `deploy ${args.id} (${dep.service}) rolled back — reason: ${args.reason}`,
      );

      // Simulate recovery: 3 hourly buckets decaying toward baseline, only if the
      // service is actually degraded (avoids fabricating change for innocent deploys).
      let recoverySimulated = false;
      const last = db
        .prepare(
          `SELECT ts, errors * 1.0 / NULLIF(requests, 0) AS er, p99_ms, requests
             FROM metrics WHERE service = ? ORDER BY ts DESC LIMIT 1`,
        )
        .get(dep.service) as { ts: string; er: number | null; p99_ms: number; requests: number } | undefined;
      const base = db
        .prepare(
          `SELECT AVG(er) AS er, AVG(p99) AS p99 FROM (
             SELECT errors * 1.0 / NULLIF(requests, 0) AS er, p99_ms AS p99
               FROM metrics WHERE service = ? ORDER BY ts ASC LIMIT 48)`,
        )
        .get(dep.service) as { er: number | null; p99: number | null };

      if (last?.er !== null && base?.er !== null && last && last.er > 2 * (base.er ?? 0)) {
        const endpoint = db
          .prepare(`SELECT endpoint FROM metrics WHERE service = ? LIMIT 1`)
          .get(dep.service) as { endpoint: string };
        let t = Date.parse(last.ts) + HOUR_MS;
        const steps = [
          { f: 0.45, p: 0.5 },
          { f: 0.15, p: 0.2 },
          { f: 1.0, p: 1.0 }, // back to baseline
        ];
        const ins = db.prepare(
          `INSERT INTO metrics (ts, service, endpoint, requests, errors, p99_ms) VALUES (?, ?, ?, ?, ?, ?)`,
        );
        for (const s of steps) {
          const er = (base.er ?? 0) + (last.er - (base.er ?? 0)) * s.f;
          const p99 = (base.p99 ?? 200) + (last.p99_ms - (base.p99 ?? 200)) * s.p;
          const requests = last.requests;
          ins.run(iso(t), dep.service, endpoint.endpoint, requests, Math.round(requests * er), round(p99, 1));
          t += HOUR_MS;
        }
        recoverySimulated = true;
      }
      db.exec("COMMIT");

      return textResult({
        ok: true,
        deploy: args.id,
        service: dep.service,
        rolled_back_at: now,
        recovery_simulated: recoverySimulated,
        next: recoverySimulated
          ? "Three hourly recovery buckets were appended. Verify with deploy_stats or query_db and report the trend."
          : "No degradation was present to recover from.",
      });
    } catch (err) {
      try { db.exec("ROLLBACK"); } catch { /* already closed/rolled back */ }
      return textResult({ ok: false, error: (err as Error).message });
    } finally {
      db.close();
    }
  },
};