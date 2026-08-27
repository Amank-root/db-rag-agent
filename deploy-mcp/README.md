# deploy-mcp

Stdio MCP server exposing the deterministic incident world to TrueForge.

- `npm run build` — compile
- `npm run seed` — (re)build the world at `data/incident-world.sqlite` (idempotent)
- `npm test` — determinism, SQL-guard, and gating tests
- `npm start` — serve over stdio (TrueForge launches this via the connector)

Tools: `list_deploys`, `get_deploy`, `deploy_stats`, `list_alerts`, `get_alert`,
`query_db` (read-only) · `rollback_deploy`, `write_back`, `open_pr` (approval-gated
writes; `readOnlyHint: false` / `destructiveHint` annotations).

The scenario clock is frozen at **2026-08-27T14:00Z** so every clone sees the same
incident: culprit deploy **dep-4c21** on `checkout-api`.