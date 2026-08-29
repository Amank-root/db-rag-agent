import { z } from "zod";
import { openWorld } from "../world.js";
import { assertReadOnlySql, MAX_ROWS } from "../sql-guard.js";
import { textResult } from "../shared.js";

export const queryDb = {
  name: "query_db",
  config: {
    title: "Query database (read-only)",
    description:
      `Run ONE read-only SQL SELECT/WITH against the incident world (max ${MAX_ROWS} rows). ` +
      "Tables: deploys(id,service,version,commit_sha,title,author,started_at,finished_at,status,rolled_back,rolled_back_at,notes); " +
      "alerts(id,name,source,service,severity,title,status,created_at,payload_json); " +
      "metrics(ts,service,endpoint,requests,errors,p99_ms) — hourly buckets, ts = bucket start; " +
      "analysis_results(id,created_at,question,sql,result_json,summary); " +
      "pr_log(id,created_at,branch,title,body,url); events(id,ts,kind,detail).",
    inputSchema: { sql: z.string().describe("A single read-only SELECT/WITH statement") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  handler: async (args: { sql: string }) => {
    try {
      const { normalized } = assertReadOnlySql(args.sql);
      const db = openWorld({ readOnly: true }); // hard enforcement at connection level
      try {
        const rows = db.prepare(normalized).all();
        return textResult({ ok: true, rowCount: rows.length, rows });
      } finally {
        db.close();
      }
    } catch (err) {
      return textResult({ ok: false, error: (err as Error).message });
    }
  },
};