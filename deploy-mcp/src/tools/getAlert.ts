import { z } from "zod";
import { openWorld } from "../world.js";
import { textResult } from "../shared.js";

export const getAlert = {
  name: "get_alert",
  config: {
    title: "Get alert",
    description: "Full alert payload by id (alrt-0001) or name (payment-failures).",
    inputSchema: { idOrName: z.string().describe("Alert id or name") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  handler: async (args: { idOrName: string }) => {
    const db = openWorld({ readOnly: true });
    try {
      const row = db
        .prepare(`SELECT * FROM alerts WHERE id = ? OR name = ?`)
        .get(args.idOrName, args.idOrName) as Record<string, unknown> | undefined;
      if (!row) return textResult({ ok: false, error: `Alert '${args.idOrName}' not found.` });
      row.payload = JSON.parse(String(row.payload_json));
      delete row.payload_json;
      return textResult({ ok: true, alert: row });
    } finally {
      db.close();
    }
  },
};