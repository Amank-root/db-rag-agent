# PRD: Deploy Detective — Incident Response + Analytics Agent

**Project:** Deploy Detective ("D2")
**Hackathon:** The Agent Harness Hackathon (WeMakeDevs x TrueFoundry x Qodo)
**Date:** August 27, 2026
**Status:** Draft v1.0
**Author:** Solo builder
**Owner:** Solo builder

---

## 1. Executive Summary

Deploy Detective is a self-contained, approval-gated agent built on the **TrueForge** harness. It performs two connected jobs that mirror what a real on-call engineer does:

1. **Incident response loop** — investigates an alert with read-only queries and sandbox diagnosis, finds the deploy that caused it, and **pauses for human approval before rolling anything back**.
2. **Analytics loop** — answers a plain-English data question by writing and running SQL in the sandbox, renders a chart, and **pauses for approval before writing anything back**.

Everything is fully self-contained (seeded data, no external production accounts), so the 3-minute demo never breaks and a judge can run the repo on their own machine.

**Primary goal:** Win the **Grand Prize — Best Use of TrueForge** (NVIDIA DGX Spark). This PRD optimizes for that single track.

---

## 2. Background & Problem

LLMs are excellent at *explaining* what an on-call engineer should check. The hard problem — and the gap the hackathon asks us to solve — is building a system that *actually does the investigation*.

Real incident response requires:

- Reaching a tool to pull real data (deploys, alerts, metrics).
- Running generated diagnostic code somewhere safe.
- Splitting a large investigation across parallel workers.
- **Stopping and asking a human before doing anything irreversible** (rollback, restart).
- Remembering where it was if the session drops.

TrueForge provides the runtime for all of these. The challenge is to make the harness do that work — not sit underneath a thin chat wrapper.

---

## 3. Goals & Non-Goals

### Goals
- An agent that **investigates**, **acts safely**, and **asks before acting irreversibly**, using most of the TrueForge harness.
- A demo that visibly shows: a real tool reached via MCP, code run in the sandbox, and **the approval pause**.
- A public repo a stranger can clone and run.
- A Qodo review trail from day one, with evidence in the README.

### Non-Goals
- Not a production SaaS platform.
- No real production infrastructure, real customer data, or paid third-party accounts.
- No multi-team / multi-tenant concerns.
- No custom model training.

---

## 4. Personas & Users

| Persona | Description | Needs |
|---|---|---|
| **On-call engineer** | Receives an alert, must triage fast and safely | Quick, safe root-cause; confirmation before rollback |
| **Data analyst** | Wants answers from a database without writing SQL | Plain-English query → result + chart, with approval before writes |
| **Hackathon judge** | Evaluates harness use, safety, and runnable repo | Sees MCP + sandbox + approval visibly working; can run the repo |

These are the same persona in practice (the solo builder is also the demo's user). The product is a **reference-grade on-call/data agent**, not a multi-user app.

---

## 5. User Stories

### Incident response loop
- **US-1** As an on-call engineer, I can tell the agent "investigate the payment-failures alert," and it pulls the relevant data.
- **US-2** The agent runs read-only queries and sandbox diagnostics to find the likely cause.
- **US-3** The agent can spawn **subagents** to investigate deploys, alerts, and DB metrics in parallel and merge the results.
- **US-4** Before any irreversible action (e.g., rollback), the agent **pauses and asks for my approval**; read-only steps run freely.
- **US-5** I can approve, and the agent completes the rollback and reports the outcome.
- **US-6** If my session drops or I refresh, the agent **resumes** the same investigation (persistent session).

### Analytics loop
- **US-7** As an analyst, I can ask "which endpoint cost us the most last week?" in plain English.
- **US-8** The agent writes SQL, runs it **in the sandbox**, and explains the result.
- **US-9** The agent renders a **chart** (generative UI) to make the result legible.
- **US-10** Before writing back to the DB or opening a PR, the agent **pauses for approval**.

---

## 6. Functional Requirements

### FR-1: MCP tool connectivity
- A custom MCP server (`deploy-mcp`) exposes real tools:
  - `list_deploys` / `get_deploy` / `deploy_stats`
  - `list_alerts` / `get_alert`
  - `query_db` (read-only SQL against seeded dataset)
- The agent must call these as tools, not receive data in the prompt.

### FR-2: Sandboxed execution
- Agent-written diagnostic Python and SQL must run in an isolated **Daytona** sandbox.
- The bisect logic that locates the "bad deploy" must be **computed in the sandbox**, not guessed by the model.

### FR-3: Subagents
- Investigation may be delegated to **parallel subagents** (deploys / alerts / metrics) whose summaries are merged.

### FR-4: Approvals (control & safety)
- Any tool that **writes, deletes, or acts irreversibly** is gated on a human approval (e.g., `rollback_deploy`, `write_back`, `open_pr`).
- Read-only tools execute without interruption.
- The approval pause must be prominent in the demo.

### FR-5: Persistent sessions
- A session must survive a refresh / reconnect / server restart and resume mid-task.

### FR-6: Model provider agnostic
- The agent runs on any configured provider (OpenAI, Anthropic, etc.), switchable from the UI.

### FR-7: Qodo-reviewed development
- All substantive changes flow through pull requests reviewed by **Qodo** before merge.
- README includes a `## Qodo Code Review Evidence` section linking to a representative merged PR.

### FR-8: Seeded, self-contained dataset
- Deploy history, alert feed, and DB metrics are generated deterministically so the demo is reproducible with zero external accounts.

---

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Runnability** | One-command start (`npx @truefoundry/trueforge`); judge can clone and run |
| **Security** | API keys, OAuth, and personal data never in repo or video; creds only in TrueForge Settings |
| **Reliability** | Demo path is deterministic (seeded data) and does not depend on live third-party services |
| **Code quality** | Clean, structured, documented; passes Qodo High-severity findings |
| **Performance** | Investigation completes within demo time (~2 min for the incident loop) |
| **Observability** | Agent shows what it is doing, what it is waiting on, and what it did |
---

## 8. Success Metrics

The six equal-weighted judging criteria — scored "as hard as the demo as the code":

| Criterion | How D2 maximizes it |
|---|---|
| **Potential impact** | On-call triage + data analysis are real, valued jobs |
| **Creativity** | Multi-step root-cause loop with parallel subagents and an approval gate, more than a chatbot |
| **Technical excellence** | Two narrow loops complete end-to-end, not three half-features |
| **Use of sponsor tools** | TrueForge does the work: MCP + sandbox + subagents + approvals + persistent sessions; Qodo reviews the PRs |
| **Control & safety** | Sandbox isolates generated code; approval gate before every irreversible action — **the differentiator** |
| **Presentation** | A natural 3-minute narrative: alert → investigate → cause → **pause for approval** → act → resume → chart |

**Primary KPI:** the approval-gate moment is visible and prominent in the demo (the one criterion organizers note "nobody films").

---

## 9. Milestones & Timeline (7 days, solo)

| Day | Milestone | Deliverable |
|---|---|---|
| **1** | Register, GitHub repo, **Qodo setup**, run TrueForge, connect model + sandbox | Working harness + reviewed repo |
| **2** | Write `deploy-mcp` server + seed dataset | Real tools in TrueForge |
| **3** | Build **incident loop** (investigate → sandbox bisect → approval → rollback) | Working incident agent |
| **4** | Build **analytics loop** (SQL → sandbox → chart → approval) | Working analytics agent |
| **5** | Persistent sessions + agent instruction hardening | Resumable, hardened agent |
| **6** | Qodo hardening, docs, README + evidence | Clean, runnable repo |
| **7** | Demo video (~3 min) + submission + social post | Submission |

---

## 10. Open Questions / Risks

| Risk | Mitigation |
|---|---|
| Sandbox (Daytona) setup friction | Build sandbox-free first (local), add Daytona by Day 3 |
| Approval gate not triggering | Explicitly define write/delete tools as approval-gated; test early |
| Qodo not responding on PR | Verify GitHub app access; comment `/agentic_review` |
| Demo flakiness | Fully seeded, deterministic data; no live services in the demo path |
| Model cost while iterating | Use a cheaper provider for iteration, switch to best model for the filmed demo |

**Open decisions for the owner:**
- Seed data carrier: SQLite vs. JSON vs. Postgres (recommend SQLite/JSON for zero-account reliability).
- Model provider for the recorded demo (OpenAI vs. Anthropic).

---

## 11. References

- Hackathon page: https://www.wemakedevs.org/hackathons/trueforge
- Getting started guide: https://www.wemakedevs.org/blogs/agent-harness-hackathon-kick-off
- TrueForge example agents: https://github.com/truefoundry/trueforge/tree/examples/agent-cookbook/examples