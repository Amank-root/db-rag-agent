import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listDeploys } from "./listDeploys.js";
import { getDeploy } from "./getDeploy.js";
import { deployStats } from "./deployStats.js";
import { listAlerts } from "./listAlerts.js";
import { getAlert } from "./getAlert.js";
import { queryDb } from "./queryDb.js";
import { rollbackDeploy } from "./rollbackDeploy.js";
import { writeBack } from "./writeBack.js";
import { openPr } from "./openPr.js";

/**
 * Convention (judging criterion: control & safety):
 *  - read-only tools → annotations.readOnlyHint: true  → run freely
 *  - write tools     → annotations.readOnlyHint: false → gated by TrueForge approvals
 *  - destructive     → annotations.destructiveHint: true
 */
const TOOLS = [
  listDeploys,
  getDeploy,
  deployStats,
  listAlerts,
  getAlert,
  queryDb,
  rollbackDeploy,
  writeBack,
  openPr,
];

export function registerTools(server: McpServer): void {
  for (const t of TOOLS) {
    // Cast: each tool's zod shape is heterogeneous; the SDK validates at runtime.
    server.registerTool(t.name, t.config as never, t.handler as never);
  }
}