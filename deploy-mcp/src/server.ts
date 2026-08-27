#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";
import { dbPath } from "./world.js";

const server = new McpServer({ name: "deploy-mcp", version: "1.0.0" });
registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
// stderr only — stdout is reserved for the MCP protocol.
console.error(`[deploy-mcp] ready on stdio — world db: ${dbPath()}`);