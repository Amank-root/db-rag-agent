## Issue description
The fresh-clone Quickstart reaches `npm run create-agent` without installing the root package dependencies, so `tsx` and the SDK are unavailable.

## Issue Context
The setup script currently installs dependencies only after changing into `deploy-mcp`.

## Fix Focus Areas
- README.md[64-66]
- scripts/setup.sh[3-12]
- package.json[15-21]

---
## Issue description
The automated creation flow loads a manifest that has no `github` MCP entry, despite documenting GitHub tool support.

## Issue Context
`create-agent.ts` submits `agent.json` unchanged, and that manifest currently lists only `deploy-mcp`.

## Fix Focus Areas
- README.md[85-93]
- agent.json[6-19]
- scripts/create-agent.ts[38-64]

---
## Issue description
The automated setup claim does not match the script, which creates only the agent and leaves connector registration manual.

## Issue Context
Either register supported connectors through the SDK before creating the agent, or make the Quickstart explicitly include the required manual connector step and remove the pre-loaded claim.

## Fix Focus Areas
- README.md[64-83]
- scripts/create-agent.ts[61-81]

---
## Issue description
All exceptions from listing and updating agents currently fall through to agent creation.

## Issue Context
Creation should occur only when a successful list proves no matching agent exists; operational and update failures must propagate with their original context.

## Fix Focus Areas
- scripts/create-agent.ts[43-67]

---
## Issue description
The newly documented connector-loading step uses a manifest with an environment-specific absolute executable path.

## Issue Context
The setup builds `deploy-mcp/dist/server.js` under the current checkout, so the connector must resolve that checkout rather than `/workspaces/db-rag-agent`.

## Fix Focus Areas
- README.md[68-70]
- connectors/deploy-mcp.json[5-7]
- scripts/setup.sh[3-14]

---
## Issue description
Rollback recovery is written only for the culprit deploy's service, leaving the actual alert service degraded and firing.

## Issue Context
The seeded culprit is checkout-api, but payment-failures targets payment-gateway and the seed models a cascading payment-gateway degradation.

## Fix Focus Areas
- deploy-mcp/src/tools/rollbackDeploy.ts[42-97]
- deploy-mcp/src/seed/build.ts[143-156]
- deploy-mcp/src/seed/scenario.ts[78-97]
- deploy-mcp/src/test/tools.test.ts[44-58]

---
## Issue description
The recommended deploy_stats verification window is anchored to deployment time and cannot see newly appended recovery metrics.

## Issue Context
The culprit starts 26 hours before scenario time, while rollback appends rows after the latest seeded metric near scenario time.

## Fix Focus Areas
- deploy-mcp/src/tools/deployStats.ts[33-50]
- deploy-mcp/src/tools/rollbackDeploy.ts[77-108]
- deploy-mcp/src/test/tools.test.ts[44-58]

---
## Issue description
Caller-provided LIMIT values bypass the query_db maximum-row contract.

## Issue Context
Do not merely detect the presence of LIMIT; enforce a ceiling regardless of query shape, ideally with a safe outer query or post-execution truncation plus overflow detection.

## Fix Focus Areas
- deploy-mcp/src/sql-guard.ts[8-32]
- deploy-mcp/src/tools/queryDb.ts[20-31]
- deploy-mcp/src/test/sql-guard.test.ts[5-17]

---

## Issue description
The setup preflight accepts Node releases below the declared and runtime-compatible minimum.

## Issue Context
Compare major/minor/patch or use a standard semver check against 22.13.0 before installation and build.

## Fix Focus Areas
- scripts/setup.sh[5-9]
- deploy-mcp/package.json[7-10]
- README.md[47-50]

---
## Issue description
The analysis record and its audit event are separate autocommit operations, allowing partial success.

## Issue Context
Wrap both inserts in one transaction and roll it back before returning an error; add a failure-path test.

## Fix Focus Areas
- deploy-mcp/src/tools/writeBack.ts[20-39]
- deploy-mcp/src/test/tools.test.ts[1-58]

---

## Issue description
The simulated PR and its audit event can commit independently, causing partial success and unsafe retries.

## Issue Context
Use a transaction for number allocation, PR insertion, and event insertion, with rollback on every failure.

## Fix Focus Areas
- deploy-mcp/src/tools/openPr.ts[19-41]
- deploy-mcp/src/test/tools.test.ts[1-58]

---

## Issue description
Reseeding deletes the usable database before replacement success and lacks failure cleanup.

## Issue Context
Build into a temporary sibling file, always roll back/close in finally, then atomically rename it over the destination only after commit and validation.

## Fix Focus Areas
- deploy-mcp/src/seed/build.ts[80-88]
- deploy-mcp/src/seed/build.ts[168-177]
- deploy-mcp/src/test/seed.test.ts[23-31]

---