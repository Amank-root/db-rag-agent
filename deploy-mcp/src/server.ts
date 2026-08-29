import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools/index.js";
import { dbPath } from "./world.js";

const PORT = Number(process.env.PORT || 3001);

function buildServer() {
    const server = new McpServer(
        { name: "deploy-mcp", version: "1.0.0" },
        { capabilities: { tools: {} } }
    );
    registerTools(server);
    return server;
}

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/", (_req, res) => {
    res.type("text/plain").send("Deploy Detective MCP. POST MCP requests to /mcp.");
});

app.post("/mcp", async (req, res) => {
    // Stateless: a fresh server and transport per request.
    try {
        const server = buildServer();
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

        res.on("close", () => {
            transport.close();
            server.close();
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (err) {
        console.error("[deploy-mcp] request failed:", err || err);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: "2.0",
                error: { code: -32603, message: "Internal server error" },
                id: null
            });
        }
    }
});

app.listen(PORT, () => {
    console.log(`[deploy-mcp] listening on http://localhost:${PORT}/mcp`);
    console.log(`[deploy-mcp] world db: ${dbPath()}`);
});
