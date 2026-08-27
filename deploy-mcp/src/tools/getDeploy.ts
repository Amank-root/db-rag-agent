import { z } from "zod";
import { openWorld } from "../world.js";
import { textResult } from "../shared.js";

export const getDeploy = {
  name: "get_deploy",
  config: {
    title: "Get deploy",
    description: "Full detail for a single deploy by id (e.g. dep-4c21).",
    inputSchema: { id: z.string().describe("Deploy id, e.g. dep-4c21") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  handler: async (args: { id: string }) => {
    const db = openWorld({ readOnly: true });
    try {
      const row = db.prepare(`SELECT * FROM deploys WHERE id = ?`).get(args.id) as
        | Record<string, unknown>
        | undefined;
      if (!row) return textResult({ ok: false, error: `Deploy ${args.id} not found.` });
      if (row.rolled_back) {
        row.note = `This deploy was rolled back at ${row.rolled_back_at}.`;
      }
      return textResult({ ok: true, deploy: row });
    } finally {
      db.close();
    }
  },
};