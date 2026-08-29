#!/usr/bin/env node
/**
 * Deploy Detective — TrueForge SDK agent creation script.
 *
 * Run this after starting TrueForge (npx @truefoundry/trueforge) to programmatically
 * create the Deploy Detective agent.
 *
 * Usage:
 *   npx tsx scripts/create-agent.ts
 *
 * Requires: @truefoundry/trueforge-sdk
 *
 * Note: Custom stdio MCP servers (like deploy-mcp) must be added via TrueForge UI:
 *   Settings → Connectors → Add connector → load connectors/deploy-mcp.json
 * Built-in GitHub MCP is configured in: Settings → Connectors → github → add GITHUB_TOKEN
 */

import { TrueForge } from "@truefoundry/trueforge-sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const TRUEFORGE_URL = process.env.TRUEFORGE_URL ?? "http://localhost:8790";
const AGENT_NAME = "deploy-detective";

async function main() {
  console.log(`[create-agent] Connecting to TrueForge at ${TRUEFORGE_URL}...`);

  const client = new TrueForge({
    baseUrl: TRUEFORGE_URL,
    timeoutInSeconds: 60,
  });

  // Load agent manifest
  const agentManifest = JSON.parse(
    readFileSync(join(ROOT, "agent.json"), "utf-8")
  );

  // Check if agent already exists
  let agent;
  try {
    const agentsResponse = await client.agents.list();
    const agents = agentsResponse.data;
    const existing = agents.find((a) => a.name === AGENT_NAME);
    if (existing) {
      console.log(`[create-agent] Agent "${AGENT_NAME}" already exists (id: ${existing.id})`);
      console.log("[create-agent] Updating manifest...");
      const updateResponse = await client.agents.update(existing.id, { manifest: agentManifest });
      agent = updateResponse.data;
      console.log(`[create-agent] Updated agent: ${agent.id}`);
    } else {
      throw new Error("not found");
    }
  } catch {
    // Create new agent
    console.log(`[create-agent] Creating agent "${AGENT_NAME}"...`);
    const createResponse = await client.agents.create({
      name: AGENT_NAME,
      manifest: agentManifest,
    });
    agent = createResponse.data;
    console.log(`[create-agent] Created agent: ${agent.id}`);
  }

  // Note: Custom stdio MCP servers (like deploy-mcp) must be added via TrueForge UI:
  // Settings → Connectors → Add connector → load connectors/deploy-mcp.json
  // Built-in GitHub MCP: Settings → Connectors → github → add GITHUB_TOKEN
  // The agent.json references them by name: "deploy-mcp" and "github"

  console.log("\n✅ Deploy Detective agent ready!");
  console.log(`   Name: ${agent.name}`);
  console.log(`   ID: ${agent.id}`);
  console.log(`   TrueForge UI: ${TRUEFORGE_URL}`);
  console.log("\n⚠️  Required manual steps (one-time):");
  console.log("1. Add custom MCP server: Settings → Connectors → Add connector → load connectors/deploy-mcp.json");
  console.log("2. Configure GitHub MCP: Settings → Connectors → github → add your GITHUB_TOKEN (for real PR support)");
  console.log("3. Configure model: Settings → Models → select a provider");
  console.log("\nThen start investigating: 'Investigate the payment-failures alert'");
}

main().catch((err) => {
  console.error("[create-agent] Failed:", err);
  process.exit(1);
});