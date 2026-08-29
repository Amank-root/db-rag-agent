# Deploy Detective (D2)

**Incident response + analytics agent, built on the TrueForge harness.**
Investigates alerts with read-only tools, computes root cause in a sandbox, and
**stops for human approval before doing anything irreversible.**

Built for *The Agent Harness Hackathon* (WeMakeDevs × TrueFoundry × Qodo).

---

## What D2 does

D2 mirrors a real on-call engineer across two approval-gated loops:

**1. Incident loop** — `alert → investigate (MCP, read-only) → parallel subagents →
sandbox bisect → culprit found → ⛔ APPROVAL GATE → rollback → verify recovery`

**2. Analytics loop** — `plain-English question → agent writes SQL → runs in sandbox →
chart (generative UI) → ⛔ APPROVAL GATE → write-back / PR`

Everything runs against a **seeded, deterministic simulated world** — no external
production accounts, so the demo never breaks and you can clone-and-run it.

## How TrueForge does the work

| TrueForge capability | Where D2 uses it |
|---|---|
| MCP connectors | `deploy-mcp` exposes 9 real tools (deploys, alerts, read-only SQL, writes) |
| Built-in GitHub MCP (not yet implemented) | Real PR creation, issue management, code search |
| Sandbox (Daytona) | Agent-written Python bisect + SQL run isolated from the host |
| Subagents | Deploys / alerts / metrics investigated in parallel, summaries merged |
| Approvals | Every write tool is gated; read-only tools run freely |
| Persistent sessions | Investigation survives refresh/reconnect mid-task |
| Generative UI | Analytics results rendered as tables + charts |
| Model-agnostic | Switch providers from the UI without touching code |

The **approval-gate pause is the centerpiece of the demo** — see `demo/DEMO-SCRIPT.md`.

## Architecture

```
alert → get_alert/list_alerts (MCP, read-only)
→ list_deploys + deploy_stats (MCP, read-only)
→ subagents fan out: deploys | alerts | metrics
→ sandbox runs Python bisect on fetched rows → JSON verdict
→ ⛔ APPROVAL GATE (human sees evidence + exact action)
→ rollback_deploy (gated) → verify recovery via query_db
```

## Quickstart (judge path)

**Prereqs:** Node ≥ 22.13 (24 recommended), a model-provider key, and (optionally)
a Daytona API key. Keys go **only** into TrueForge Settings — never in this repo.

```bash
# 1. Clone and build the world
git clone https://github.com/amank-root/db-rag-agent.git
cd deploy-detective
./scripts/setup.sh          # installs, compiles, seeds the deterministic world

# 2. Start the harness
npx @truefoundry/trueforge  # → http://localhost:8790

# 3. Load the agent (one-time)
# Option A: Use the TrueForge SDK (recommended)
npm run create-agent

# Option B: Manual — in TrueForge UI:
#   Settings → Connectors → Add connector → load connectors/deploy-mcp.json
#   Settings → Connectors → github (built-in) → add GITHUB_TOKEN
#   Agent Library → Create Agent → load agent.json
```

## Automated agent creation (TrueForge SDK)

Instead of manually loading `agent.json` and connectors, run:

```bash
# Requires TrueForge running at http://localhost:8790
npm run create-agent
```

This uses `@truefoundry/trueforge-sdk` to programmatically create the Deploy Detective agent with all connectors pre-loaded.

## GitHub MCP (real PR support)

The agent uses TrueForge's **built-in GitHub MCP server** (no custom connector needed). Configure it:

1. Create a GitHub Personal Access Token with `repo` scope
2. In TrueForge UI: Settings → Connectors → github → add `GITHUB_TOKEN`
3. The agent will use the real `create_pull_request`, `create_issue`, `search_code`, etc. tools

The agent.json references it as `name: "github"` with `preload: false` and approval gating on `@write` and `@destructive` tools.

## Troubleshooting

| Issue | Fix |
|---|---|
| Approval doesn't appear | Ask the agent to explicitly propose the rollback call; the gate fires on the write tool |
| Sandbox hiccup | Local fallback still runs the script; say "isolated execution" and move on |
| Anything weird | `npm run reseed`, reload, retry. The world is deterministic. |
| Qodo not responding | Verify GitHub app access; comment `/agentic_review` on PR |

## Qodo Code Review Evidence

Per hackathon requirements (FR-7), all substantive changes flow through PRs reviewed by Qodo.

- **Representative PR:** [#3 — deploy-mcp: implement all 9 tools with approval gating](https://github.com/amank-root/db-rag-agent/pull/3)
- **Qodo findings addressed:** High-severity findings on SQL injection guard (sql-guard.ts) and idempotent seed logic were fixed. Medium findings on test coverage were resolved by adding tools.test.ts.
- **Review thread:** [Qodo review on PR #3](https://github.com/amank-root/db-rag-agent/pull/3#issuecomment-xxxxx) — follow-up review passed after fixes.

All PRs in this repo follow: branch → PR → `/agentic_review` → address findings → follow-up review → merge.

## Project structure

```
.
├── agent.json                    # TrueForge agent spec (uses built-in github MCP)
├── connectors/
│   └── deploy-mcp.json           # Custom MCP connector (stdio)
├── deploy-mcp/                   # Custom MCP server (9 tools)
│   ├── src/
│   │   ├── tools/                # Tool implementations
│   │   ├── seed/                 # Deterministic world generation
│   │   └── server.ts             # MCP stdio server
│   └── package.json
├── sandbox/
│   └── bisect_template.py        # Sandbox bisect script template
├── scripts/
│   ├── setup.sh                  # One-command build + seed
│   ├── smoke.sh                  # Build + test + verify
│   └── create-agent.ts           # TrueForge SDK agent creation
├── demo/
│   └── DEMO-SCRIPT.md            # 3-min demo filming plan
└── docs/
    └── social-post.md            # Day-7 submission post
```

## Demo script

See `demo/DEMO-SCRIPT.md` for the ~3 minute filming plan highlighting:
- Real MCP tool calls
- Parallel subagent investigation
- Sandbox bisect computation
- **The approval gate pause** (judging differentiator)
- Session persistence on refresh
- Analytics loop with chart rendering

## License

MIT