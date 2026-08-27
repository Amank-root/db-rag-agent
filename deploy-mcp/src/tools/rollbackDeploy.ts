import { z } from "zod";
import { openWorld } from "../world.js";
import { textResult, iso, HOUR_MS } from "../shared.js";

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

      // Simulate recovery: 3 hourly buckets decaying toward baseline — only if the
      // service is actually degraded (never fabricate change for innocent deploys).
      let recoverySimulated = false;
      const last = db
        .prepare(
          `SELECT ts, errors * 1.0 / NULLIF(requests, 0) AS er, p99_ms, requests
             FROM metrics WHERE service = ? ORDER BY ts DESC LIMIT 1`,
        )
        .get(dep.service) as
        | { ts: string; er: number | null; p99_ms: number; requests: number }
        | undefined;
      const base = db
        .prepare(
          `SELECT AVG(er) AS er, AVG(p99) AS p99 FROM (
             SELECT errors * 1.0 / NULLIF(requests, 0) AS er, p99_ms AS p99
               FROM metrics WHERE service = ? ORDER BY ts ASC LIMIT 48)`,
        )
        .get(dep.service) as { er: number | null; p99: number | null } | undefined;

      if (
        last &&
        base &&
        last.er !== null &&
        base.er !== null &&
        base.p99 !== null &&
        last.er > 2 * base.er
      ) {
        const endpointRow = db
          .prepare(`SELECT endpoint FROM metrics WHERE service = ? LIMIT 1`)
          .get(dep.service) as { endpoint: string } | undefined;
        if (endpointRow) {
          const ins = db.prepare(
            `INSERT INTO metrics (ts, service, endpoint, requests, errors, p99_ms)
             VALUES (?, ?, ?, ?, ?, ?)`,
          );
          let t = Date.parse(last.ts) + HOUR_MS;
          for (const s of [
            { f: 0.45, p: 0.5 },
            { f: 0.15, p: 0.2 },
            { f: 0, p: 0 }, // fully back to baseline
          ]) {
            const er = base.er + (last.er - base.er) * s.f;
            const p99 = base.p99 + (last.p99_ms - base.p99) * s.p;
            ins.run(
              iso(t),
              dep.service,
              endpointRow.endpoint,
              last.requests,
              Math.max(0, Math.round(last.requests * er)),
              Math.round(p99 * 10) / 10,
            );
            t += HOUR_MS;
          }
          recoverySimulated = true;
        }
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
      try {
        db.exec("ROLLBACK");
      } catch {
        /* no active transaction */
      }
      return textResult({ ok: false, error: (err as Error).message });
    } finally {
      db.close();
    }
  },
};