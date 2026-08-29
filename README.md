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
| Sandbox (Daytona) | Agent-written Python bisect + SQL run isolated from the host |
| Subagents | Deploys / alerts / metrics investigated in parallel, summaries merged |
| Approvals | Every write tool is gated; read-only tools run freely |
| Persistent sessions | Investigation survives refresh/reconnect mid-task |
| Generative UI | Analytics results rendered as tables + charts |
| Model-agnostic | Switch providers from the UI without touching code |

The **approval-gate pause is the centerpiece of the demo** — see `demo/DEMO-SCRIPT.md`.

## Architecture
alert → get_alert/list_alerts (MCP, read-only)
→ list_deploys + deploy_stats (MCP, read-only)
→ subagents fan out: deploys | alerts | metrics
→ sandbox runs Python bisect on fetched rows → JSON verdict
→ ⛔ APPROVAL GATE (human sees evidence + exact action)
→ rollback_deploy (gated) → verify recovery via query_db


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