# Demo script (~3 min) — film plan

**Prep checklist:** `npm run reseed` · TrueForge running · connector + agent loaded ·
model set to your best provider · Daytona connected · notifications off.

| Time | Screen | Say |
|---|---|---|
| 0:00 | Title slide / UI idle | "On-call engineers investigate alerts with dozens of read-only checks, then pause before anything irreversible. Deploy Detective does the same — inside the TrueForge harness." |
| 0:20 | Type: `Investigate the payment-failures alert.` | "It starts by reaching real tools through MCP — pulls the alert, the deploys, the metrics. All read-only, so it runs freely." |
| 0:40 | Show subagent fan-out | "It fans out to parallel subagents — deploys, alerts, metrics — and merges them into one timeline." |
| 0:55 | Show sandbox running the bisect script | "It doesn't guess. It writes a bisect script, runs it in the sandbox, and reports the computed verdict: **dep-4c21**, error-rate delta ≈ +0.075." |
| 1:20 | **THE PAUSE** — approval card on screen | "Now the part most agents skip: rollback is irreversible, so it STOPS and asks — evidence, exact action, how to verify. Nothing happens until I approve." |
| 1:45 | Click **Approve** | "Approved. It rolls back and verifies recovery from real metrics." |
| 2:10 | Refresh the page | "Session persisted — refresh, and the investigation is exactly where it was." |
| 2:35 | Type: `Which endpoint cost us the most errors last week?` | "Second loop: analytics. It writes SQL, runs it read-only, renders the chart — checkout-api tops the list with payment-gateway second, exactly the incident pair. If I asked it to write back, it would pause for approval again." |
| 2:55 | Outro | "MCP tools, sandboxed code, subagents, approvals, persistent sessions — TrueForge did the work. Thanks." |

**Rescue plans**
- Approval doesn't appear → ask the agent to explicitly propose the rollback call; the gate fires on the write tool.
- Sandbox hiccup → local fallback still runs the script; say "isolated execution" and move on.
- Anything weird → `npm run reseed`, reload, retry. The world is deterministic.