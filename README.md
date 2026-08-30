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

2. **Analytics loop** — Given a plain-English question, it writes and runs SQL in the sandbox, renders a chart, then **pauses for approval** before writing results back or opening a PR.

**For:** On-call engineers, data analysts, and hackathon judges evaluating TrueForge's harness capabilities. Everything runs against a seeded, deterministic simulated world — no external accounts needed.

---

## How did you use TrueForge in your project?

TrueForge is the **runtime harness** — the agent doesn't just "call an API"; TrueForge orchestrates the entire execution loop:

| TrueForge capability | How D2 uses it |
|---|---|
| **MCP connectors** | A single custom `deploy-mcp` (stdio) server exposes all 9 tools D2 needs: `list_deploys`, `get_deploy`, `deploy_stats`, `list_alerts`, `get_alert`, `query_db` (read-only), plus `rollback_deploy`, `write_back`, `open_pr` (approval-gated writes). No external MCP servers or accounts required — even PR creation is simulated and recorded to a `pr_log` table inside the seeded world. |
| **Sandbox (Daytona)** | Agent writes and executes a Python bisect script in isolation; SQL runs in sandbox; charts rendered from real output. |
| **Subagents** | Incident investigation fans out to 3 parallel subagents (deploys, alerts, metrics); summaries merged into one timeline. |
| **Approvals** | Every write tool (`rollback_deploy`, `write_back`, `open_pr`) is gated on human approval; read-only tools run freely. |
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

## Architecture

The harness sits between the user and a single MCP surface — a purpose-built `deploy-mcp` server backed entirely by the seeded, mock SQLite world. Every path that mutates state routes back through the approval gate before it reaches the user.

```mermaid
flowchart TB
    User(("👤 User")) -->|"prompt"| TF

    subgraph TF["⚡ TrueForge Harness"]
        direction LR
        Model["🤖 Model Provider"]
        Sessions["💾 Sessions &amp; Persistence"]
        Approvals["🔐 Approval Gates"]
        Subagents["🧩 Dynamic Subagents"]
        GenUI["✨ Generative UI"]
        Sandbox["📦 Sandbox<br/>(Daytona)"]

        Model --> Sessions
        Model --> Subagents
        Model --> Sandbox
        Model --> GenUI
        Model --> Approvals
    end

    TF -->|"tool calls"| MCP["🔌 deploy-mcp<br/>(stdio)"]

    MCP --> SQLite[("🗄️ SQLite World<br/>(mock, seeded)")]

    Approvals -.->|"pause → resume"| User

    classDef harness fill:#E8F4FF,stroke:#1976D2,stroke-width:2px,color:#0D47A1;
    classDef mcp fill:#F5EAFE,stroke:#8E44AD,stroke-width:2px,color:#4A235A;
    classDef ext fill:#FFF4E5,stroke:#F39C12,stroke-width:2px,color:#7D4E00;
    classDef actor fill:#EAFBEA,stroke:#2E7D32,stroke-width:2px,color:#1B5E20;

    class Model,Sessions,Approvals,Subagents,GenUI,Sandbox harness;
    class MCP mcp;
    class SQLite ext;
    class User actor;

    style TF fill:#F7FBFF,stroke:#1976D2,stroke-width:3px,color:#0D47A1
```

### MCP Tool Surface

`deploy-mcp` splits cleanly into read-only tools the agent can call freely, and write tools that are always approval-gated.

```mermaid
mindmap
  root((deploy-mcp))
    Read-only
      list_deploys
      get_deploy
      deploy_stats
      list_alerts
      get_alert
      query_db
    🔐 Write — approval gated
      rollback_deploy
      write_back
      open_pr
```

---

## Request Flow: Incident Investigation

This is the on-call path: three subagents fan out in parallel to gather deploys, alerts, and metrics, the agent runs a bisect in the sandbox to compute the culprit deploy, then stops dead at the approval gate before touching production.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant TF as TrueForge
    participant Agent
    box rgba(232,244,255,0.35) Dynamic Subagents
        participant SA1 as Deploys Agent
        participant SA2 as Alerts Agent
        participant SA3 as Metrics Agent
    end
    participant MCP as deploy-mcp
    participant SQL as SQLite
    participant Sandbox

    User->>TF: Investigate payment-failures alert
    TF->>Agent: Load manifest, start session

    par Fan out investigation
        Agent->>SA1: Fetch recent deploys
        SA1->>MCP: list_deploys / deploy_stats
        MCP->>SQL: SELECT deploy records
        SQL-->>MCP: rows
        MCP-->>SA1: deploy stats
    and
        Agent->>SA2: Fetch alert details
        SA2->>MCP: get_alert
        MCP->>SQL: SELECT alert records
        SQL-->>MCP: rows
        MCP-->>SA2: alert details
    and
        Agent->>SA3: Fetch metrics window
        SA3->>MCP: query_db(sql)
        MCP->>SQL: SELECT metric records
        SQL-->>MCP: rows
        MCP-->>SA3: metric rows
    end

    SA1-->>Agent: deploy summary
    SA2-->>Agent: alert summary
    SA3-->>Agent: metrics summary

    Agent->>Sandbox: Run bisect with candidates and metrics
    Sandbox-->>Agent: Verdict - culprit is dep-4c21

    Agent-->>User: Propose rollback_deploy dep-4c21
    Note over User,Agent: APPROVAL GATE

    User->>Agent: Approves
    Agent->>MCP: rollback_deploy dep-4c21
    MCP->>SQL: BEGIN then update deploys then COMMIT
    SQL-->>MCP: OK
    MCP-->>Agent: Rollback confirmed

    Agent->>MCP: query_db to verify recovery
    MCP->>SQL: SELECT recent error rates
    SQL-->>MCP: rows
    MCP-->>Agent: error rate back to baseline

    Agent-->>User: Root cause confirmed, service recovered

```

---

## Request Flow: Analytics Query

This is the ad-hoc question path: the agent writes its own SQL, runs it read-only through the SQL guard, renders results with Generative UI, and only hits the approval gate when the user asks to persist the result.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant TF as TrueForge
    participant Agent
    participant MCP as deploy-mcp
    participant SQL as SQLite
    participant GenUI as Generative UI

    User->>TF: "Which endpoint cost us the most errors last week?"
    TF->>Agent: Load manifest, start session

    Agent->>Agent: Write SQL query
    Agent->>MCP: query_db(sql)
    MCP->>SQL: Execute read-only SQL (SQL guard enforced)
    SQL-->>MCP: Result rows
    MCP-->>Agent: Rows + metadata

    Agent->>GenUI: Render table + bar chart
    GenUI-->>User: Visual results in chat

    User->>Agent: "Write this back"
    Agent-->>User: Propose write_back
    Note over User,Agent: 🔐 APPROVAL GATE

    User->>Agent: Approves
    Agent->>MCP: write_back(question, sql, summary, json)
    MCP->>SQL: BEGIN
    MCP->>SQL: INSERT INTO analysis_results(...)
    MCP->>SQL: INSERT INTO events(...)
    MCP->>SQL: COMMIT
    SQL-->>MCP: OK
    MCP-->>Agent: analysis_id stored

    Agent-->>User: Confirmed persisted
```

---

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
#   Agent Library → Create Agent → load agent.json
```

No other connectors, tokens, or external accounts are needed — `deploy-mcp` is self-contained.

## Automated agent creation (TrueForge SDK)

Creates/updates the agent manifest. The `deploy-mcp` connector must still be added manually via the TrueForge UI (step 3 above).

```bash
# Requires TrueForge running at http://localhost:8790
npm run create-agent
```

## Troubleshooting

| Issue | Fix |
|---|---|
| Approval doesn't appear | Ask the agent to explicitly propose the rollback call; the gate fires on the write tool |
| Sandbox hiccup | Local fallback still runs the script; say "isolated execution" and move on |
| Anything weird | `npm run reseed`, reload, retry. The world is deterministic. |
| Qodo not responding | Verify GitHub app access on the repo; comment `/agentic_review` on PR |
| Connectors not loading | Ensure `TRUEFORGE_DATA_DIR` is set and you ran `./scripts/setup.sh` first |

## Project structure

```
.
├── agent.json                    # TrueForge agent spec (deploy-mcp only, approval-gated)
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

## License

MIT
