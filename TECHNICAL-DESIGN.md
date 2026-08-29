# Companion Doc: Deploy Detective — Technical Design & Build Guide

**Companion to:** `PRD.md`
**Purpose:** The hands-on engineering spec a solo builder follows to implement the PRD against TrueForge. Every section maps to a PRD FR/story.

---

## 1. System Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    TrueForge harness                        │
│              (npx @truefoundry/trueforge → :8790)           │
│                                                             │
│   ┌───────────────┐   ┌───────────────┐   ┌──────────────┐ │
│   │  Model (any   │   │  Subagents    │   │  Persistent  │ │
│   │  provider)    │   │  (parallel    │   │  Sessions    │ │
│   │               │   │  investigation│   │  (resume)    │ │
│   └───────────────┘   └───────────────┘   └──────────────┘ │
│           │                   │                 │           │
│           ▼                   ▼                 ▼           │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  Approvals layer (write/delete/irreversible gated)  │   │
│   └─────────────────────────────────────────────────────┘   │
│           │                   │                              │
│           ▼                   ▼                              │
│   ┌──────────────────┐  ┌─────────────────────┐             │
│   │  MCP: deploy-mcp │  │  Sandbox (Daytona)  │             │
│   │  real tools      │  │  run Python/SQL     │             │
│   └──────────────────┘  └─────────────────────┘             │
└────────────────────────────────────────────────────────────┘
```

**Flow, incident loop:**
`alert arrives → read-only queries via MCP → subagents (deploys/alerts/metrics) in parallel → sandbox runs bisect → cause found → APPROVAL GATE on rollback → approved → action executes → session logged/resumable`

**Flow, analytics loop:**
`question → agent writes SQL → runs in sandbox → read-only chart render → APPROVAL GATE on write-back/PR → approved`

---

## 2. Prerequisites (Day 1)

| Item | Version / Setup |
|---|---|
| Node.js | **>= 22** (env confirmed v24.18.0 ✓) |
| TrueForge | `npx @truefoundry/trueforge` → http://localhost:8790 |
| Model provider | Configure a key in Settings → Models (OpenAI, Anthropic, or any) |
| MCP connector | Our `deploy-mcp` (see §3), loaded in Settings → Connectors |
| Sandbox | Daytona API key in Settings → Sandbox providers (see §4) |
| Qodo | Install GitHub app; authorize repo (see §7) |

**Local mode** works with a single process on SQLite — sufficient for development. Scale path (Postgres + Redis) is noted but not required.

---

## 3. Custom MCP Server: `deploy-mcp`

A small TypeScript/Node MCP server exposing **real tools** to the agent. This is what makes the harness "reach a real tool" rather than a thin wrapper.

### Tools
| Tool | Reads/Writes | Approval-gated? | Notes |
|---|---|---|---|
| `list_deploys` | read | no | Deploy history (id, time, service, commit, status) |
| `get_deploy` | read | no | Detail for one deploy |
| `deploy_stats` | read | no | Error-rate series per deploy |
| `list_alerts` | read | no | Simulated alert feed (source, severity, time) |
| `get_alert` | read | no | Full alert payload |
| `query_db` | read | no | Read-only SQL over the seed dataset |
| `rollback_deploy` | **write** | **yes** | Marks a deploy rolled back; irreversible |
| `write_back` | **write** | **yes** | Persists a comput result to the dataset |
| `open_pr` | **write** | **yes** | Simulates opening a change PR |

**Convention:** read-only tools run freely; write/delete tools are **approval-gated** by TrueForge. This is the exact control-and-safety model the judging checks.

### Repo layout
```
deploy-mcp/
  server.ts          # MCP server (stdio)
  tools/             # one file per tool
  seed/              # deterministic dataset generation
    seed.ts          # build seed database/idempotent
```

### Seed dataset (deterministic, zero external accounts)
- **deploys:** ~20 rows, N services, recent dates, with one "bad" deploy (`4c21`) that introduces a spike in checkout timeouts.
- **alerts:** a few alert records referencing the bad deploy's service.
- **metrics table:** per-deploy error-rate series that lets the sandbox **compute** the correlation (so bisect is evidence-based, not guessed).

Seed generation must be **idempotent** so a judge can re-run and get the same scenario.

---

## 4. Sandbox (Daytona)

- **Why:** generated diagnostic code and SQL must execute isolated from the host. The sandbox is a core harness feature and a judging criterion.
- **Setup:** Settings → Sandbox providers → Daytona → add API key.
- **Use in incident loop:** the agent writes a short bisect script, runs it in the sandbox, reads the output, and reasons from the *computed* result.
- **Use in analytics loop:** SQL runs in the sandbox; charts are produced from real output.
- **Fallback:** develop without the sandbox first (local execution path) so iteration isn't blocked; wire Daytona by Day 3.

---

## 5. Agent Composition (TrueForge `agent.json` shape)

Each example agent is a JSON doc: **model + instructions + connectors + skills + config**. Reference the cookbook for fields: https://github.com/truefoundry/trueforge/tree/examples/agent-cookbook/examples

```
{
  "model": { "name": "REPLACE_WITH_YOUR_MODEL" },   // e.g. openai/gpt-5.2
  "instructions": "<system prompt, see §6>",
  "connectors": [ "deploy-mcp" ],
  "config": {
    "subagents": true,       // parallel investigation
    "codeMode": true,        // run Python in sandbox
    "approvals": true,       // gate writes/deletes
    "generativeUI": true,    // render tables + charts
    "sandbox": true
  }
}
```

Create the agent via UI or API:
```
curl -X POST http://localhost:8790/api/v1/agents \
  -H 'content-type: application/json' \
  -d "{\"name\":\"deploy-detective\",\"manifest\":$(cat agent.json)}"
```

Reference command is adapted from the trueforge cookbook README.

---

## 6. Agent Instructions (System Prompt Draft)

Rules baked into the agent so it behaves safely and demos well:

1. **Investigate read-only first.** Prefer read-only MCP + sandbox queries. Do not mutate data on your own.
2. **Delegation.** For a broad investigation, fan out to parallel subagents (deploys, alerts, metrics) and merge their summaries.
3. **Compute, don't guess.** Run bisect/SQL in the sandbox to determine the bad deploy / the answer; cite the computed output.
4. **The approval gate.** Before ANY irreversible step (rollback, write-back, opening a PR), STOP and produce a clear, human-readable request: what you found, the exact action, and why. Wait for approval.
5. **Clarity.** Show what you are doing and what you are waiting on (this drives the UI + demo narrative).
6. **Resume.** On a new session where a prior investigation was in progress, recover context and continue from where it stopped.

---

## 7. Qodo Workflow (every substantive change)

> Qodo is **required** of every submission, not just the Code Quality track.

1. One teammate (solo = you) with admin on the repo signs into Qodo → Integrations → SaaS → GitHub → Add installation → authorize the hackathon repo.
2. Development flow: **branch → PR → Qodo review (`/agentic_review`) → address findings → push fixes → follow-up review → human merge.** Direct pushes to `main` do NOT count.
3. Fix every valid **High** finding; dismiss invalid/deferred ones in the thread with a reason. Medium/Low are engineering judgment.
4. README **`## Qodo Code Review Evidence`** section with a link to a representative merged PR + 1–2 sentences on what Qodo surfaced + PR history showing review and follow-up review.

---

## 8. README (stranger can clone & run)

- What D2 does and the two loops.
- Prereqs (Node ≥ 22, model key, Daytona key).
- One-command start (`npx @truefoundry/trueforge`), how to load `deploy-mcp` + agent spec.
- How to regenerate the seed dataset.
- Troubleshooting (approvals not triggering, Qodo not responding, sandbox note).
- **`## Qodo Code Review Evidence`** section (see §7).
- Secrets: keys only via Settings, never in repo or screenshots.

---

## 9. Demo Script (~3 min)

1. **(0:00)** State the problem: on-call has to investigate alerts safely.
2. **(0:20)** Fire `investigate the payment-failures alert` → show the agent pulling real data via MCP.
3. **(0:50)** Show sandbox bisect running; agent reports `cause: deploy 4c21`.
4. **(1:20)** **THE PAUSE:** rollback is irreversible → agent stops and asks. This is the differentiator.
5. **(1:45)** Approve → agent rolls back → error rate recovering.
6. **(2:10)** Show session resume (refresh/reconnect, investigation intact).
7. **(2:35)** Analytics: ask a data question → SQL runs in sandbox → chart renders.
8. **(2:55)** Outro: one line on how TrueForge did the work.

---

## 10. Build Checklist (maps to PRD milestones)

- [ ] GitHub repo public; Qodo connected (Day 1)
- [ ] TrueForge running; model + sandbox configured (Day 1)
- [ ] `deploy-mcp` implemented with all tools; seed dataset idempotent (Day 2)
- [ ] Incident loop: investigate → subagents → sandbox bisect → approval → rollback (Day 3)
- [ ] Analytics loop: SQL → sandbox → chart → approval → write-back/PR (Day 4)
- [ ] Persistent sessions verified; instructions hardened (Day 5)
- [ ] Qodo findings resolved; README + evidence complete (Day 6)
- [ ] Demo video (~3 min) + submission + social post (Day 7)

---

## 11. References

- TrueForge docs: https://trueforge.dev
- Running examples: `npx @truefoundry/trueforge`
- Cookbook examples & `agent.json` structure: https://github.com/truefoundry/trueforge/tree/examples/agent-cookbook/examples
- Qodo PR review setup: https://docs.qodo.ai/code-review/use-qodo-in-prs