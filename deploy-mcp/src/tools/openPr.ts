import { z } from "zod";
import { openWorld } from "../world.js";
import { textResult } from "../shared.js";

export const openPr = {
  name: "open_pr",
  config: {
    title: "Open pull request (WRITE)",
    description:
      "Simulates opening a change PR in the incident world (recorded in pr_log). WRITE — approval-gated " +
      "by TrueForge; the agent must present title/body and wait for explicit human approval.",
    inputSchema: {
      title: z.string(),
      body: z.string().describe("Markdown PR body"),
      branch: z.string().default("d2/analytics-writeback"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  handler: async (args: { title: string; body: string; branch?: string }) => {
    const db = openWorld();
    try {
      const now = new Date().toISOString();
      const count = (db.prepare(`SELECT COUNT(*) AS n FROM pr_log`).get() as { n: number }).n;
      const prNumber = 100 + count + 1;
      const url = `https://github.com/example-org/deploy-detective/pull/${prNumber} (simulated)`;
      db.prepare(
        `INSERT INTO pr_log (created_at, branch, title, body, url) VALUES (?, ?, ?, ?, ?)`,
      ).run(now, args.branch ?? "d2/analytics-writeback", args.title, args.body, url);
      db.prepare(`INSERT INTO events (ts, kind, detail) VALUES (?, 'open_pr', ?)`).run(
        now,
        `PR #${prNumber} opened: ${args.title}`,
      );
      return textResult({
        ok: true,
        pr_number: prNumber,
        url,
        note: "Simulated inside the self-contained world.",
      });
    } finally {
      db.close();
    }
  },
};