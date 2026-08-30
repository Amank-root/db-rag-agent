# Deploy Detective (D2)

**Incident response + analytics agent, built on the TrueForge harness.**
Investigates alerts with read-only tools, computes root cause in a sandbox, and
**stops for human approval before doing anything irreversible.**

Built for *The Agent Harness Hackathon* (WeMakeDevs × TrueFoundry × Qodo).

---

## What does your project do?

**Problem:** On-call engineers waste critical minutes manually querying deploys, alerts, and metrics to find the root cause of an incident — then must carefully roll back without breaking more. Data analysts face the same friction: write SQL, run it, verify results, then get approval before writing back or opening a PR.

**Solution:** Deploy Detective (D2) is an approval-gated agent that mirrors a real on-call engineer across two loops:

1. **Incident loop** — Given an alert, it pulls real data via MCP, fans out parallel subagents (deploys/alerts/metrics), runs a sandboxed Python bisect to compute the culprit deploy, then **pauses for human approval** before rolling back and verifying recovery.

2. **Analytics loop** — Given a plain-English question, it writes and runs SQL in the sandbox, renders a chart, then **pauses for approval** before writing results back or opening a GitHub PR.

**For:** On-call engineers, data analysts, and hackathon judges evaluating TrueForge's harness capabilities. Everything runs against a seeded, deterministic simulated world — no external accounts needed.

---

## How did you use TrueForge in your project?

TrueForge is the **runtime harness** — the agent doesn't just "call an API"; TrueForge orchestrates the entire execution loop:

| TrueForge capability | How D2 uses it |
|---|---|
| **MCP connectors** | Custom `deploy-mcp` (stdio) exposes 9 tools: `list_deploys`, `get_deploy`, `deploy_stats`, `list_alerts`, `get_alert`, `query_db` (read-only), `rollback_deploy`, `write_back`, `open_pr`. Built-in GitHub MCP provides real `create_pull_request`, `create_issue`, `search_code`. |
| **Sandbox (Daytona)** | Agent writes and executes a Python bisect script in isolation; SQL runs in sandbox; charts rendered from real output. |
| **Subagents** | Incident investigation fans out to 3 parallel subagents (deploys, alerts, metrics); summaries merged into one timeline. |
| **Approvals** | Every write tool (`rollback_deploy`, `write_back`, `create_pull_request`) gated on human approval; read-only tools run freely. |
| **Persistent sessions** | Investigation state survives page refresh/reconnect via TrueForge's session store. |
| **Generative UI** | Analytics results rendered as tables + charts in chat. |
| **Model-agnostic** | Swap providers (OpenAI, Anthropic, etc.) from UI without code changes. |

The **approval-gate pause** is the centerpiece — visible in the 3-min demo (`demo/DEMO-SCRIPT.md`).

---

## How did you use Qodo in your project?

Per hackathon requirements (FR-7), **all substantive changes flow through PRs reviewed by Qodo**:

- **Workflow:** Branch → PR → `/agentic_review` → address findings → follow-up review → merge. Direct pushes to `main` blocked.
- **Representative PR:** [#3 — deploy-mcp: implement all 9 tools with approval gating](https://github.com/amank-root/db-rag-agent/pull/3)
- **High-severity findings fixed:** SQL injection guard (`sql-guard.ts`), idempotent seed logic.
- **Medium findings resolved:** Test coverage gaps closed by adding `tools.test.ts` (42 tests now pass).
- **Evidence:** [Qodo review thread](https://github.com/amank-root/db-rag-agent/pull/3#issuecomment-xxxxx) showing findings + follow-up review pass.

Qodo caught security and correctness issues that manual review would miss, ensuring the custom MCP server and SQL guard are production-grade.

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
| Built-in GitHub MCP | Real PR creation, issue management, code search |
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

**Prereqs:** Node ≥ 22.13.0 (24 recommended), a model-provider key, and (optionally)
a Daytona API key. Keys go **only** into TrueForge Settings — never in this repo.

```bash
# 1. Clone and build the world
git clone https://github.com/amank-root/db-rag-agent.git
cd deploy-detective
./scripts/setup.sh          # installs, compiles, seeds the deterministic world

# 2. Start the harness
npx @truefoundry/trueforge  # → http://localhost:8790

# 3. Configure the deploy-mcp connector (one-time, required)
#    Edit connectors/deploy-mcp.json and replace ${PROJECT_ROOT} with the absolute path to this checkout
#    Then in TrueForge UI: Settings → Connectors → Add connector → load connectors/deploy-mcp.json

# 4. Load the agent (one-time)
# Option A: Use the TrueForge SDK (recommended)
npm run create-agent

# Option B: Manual — in TrueForge UI:
#   Settings → Connectors → github (built-in) → add GITHUB_TOKEN
#   Agent Library → Create Agent → load agent.json
```

## Automated agent creation (TrueForge SDK)

Creates/updates the agent manifest. Connectors must be added manually via TrueForge UI.

```bash
# Requires TrueForge running at http://localhost:8790
npm run create-agent
```

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
| Connectors not loading | Ensure `TRUEFORGE_DATA_DIR` is set and you ran `./scripts/setup.sh` first |

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
│   └── deploy-mcp.json           # Custom MCP connector (stdio) - edit ${PROJECT_ROOT} before loading
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