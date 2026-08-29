import { z } from "zod";
import { openWorld } from "../world.js";
import { textResult } from "../shared.js";

export const writeBack = {
  name: "write_back",
  config: {
    title: "Write analysis back (WRITE)",
    description:
      "Persists a computed analytics result into analysis_results. WRITE — approval-gated by TrueForge; " +
      "the agent must present the exact payload and wait for explicit human approval.",
    inputSchema: {
      question: z.string().describe("The plain-English question that was answered"),
      sql: z.string().describe("The SQL that produced the result"),
      resultSummary: z.string().describe("One-paragraph human summary"),
      resultJson: z.string().describe("JSON-encoded result rows"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  handler: async (args: { question: string; sql: string; resultSummary: string; resultJson: string }) => {
    const db = openWorld();
    try {
      JSON.parse(args.resultJson); // fail fast on malformed JSON before writing
      const now = new Date().toISOString();
      const res = db
        .prepare(
          `INSERT INTO analysis_results (created_at, question, sql, result_json, summary)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(now, args.question, args.sql, args.resultJson, args.resultSummary);
      db.prepare(`INSERT INTO events (ts, kind, detail) VALUES (?, 'write_back', ?)`).run(
        now,
        `analysis #${res.lastInsertRowid} persisted: ${args.question}`,
      );
      return textResult({ ok: true, analysis_id: Number(res.lastInsertRowid), stored_at: now });
    } catch (err) {
      return textResult({ ok: false, error: (err as Error).message });
    } finally {
      db.close();
    }
  },
};