import { HOUR_MS } from "../shared.js";

/** Scenario clock is frozen so every judge sees the identical incident. */
export const SCENARIO_NOW = Date.UTC(2026, 7, 27, 14, 0, 0); // 2026-08-27T14:00:00Z
export const WINDOW_HOURS = 168; // 7 days of history

export const CULPRIT_DEPLOY_ID = "dep-4c21";
export const culpritStartMs = SCENARIO_NOW - 26 * HOUR_MS;

export interface ServiceProfile {
  endpoint: string;
  rph: number;   // baseline requests/hour
  err: number;   // baseline error rate
  p99: number;   // baseline p99 ms
}

export const SERVICES: Record<string, ServiceProfile> = {
  "checkout-api":    { endpoint: "POST /v1/checkout", rph: 900,  err: 0.008, p99: 260 },
  "payment-gateway": { endpoint: "POST /v1/charge",   rph: 850,  err: 0.006, p99: 320 },
  "inventory-svc":   { endpoint: "GET /v1/stock",     rph: 1400, err: 0.004, p99: 140 },
  "search-api":      { endpoint: "GET /v1/search",    rph: 2200, err: 0.010, p99: 210 },
  "auth-svc":        { endpoint: "POST /v1/token",    rph: 1600, err: 0.005, p99: 95 },
};

export interface DeployPlanItem {
  id: string;
  service: string;
  hoursAgo: number;
  title: string;
  author: string;
  status?: "succeeded" | "failed";
  notes?: string;
  commit?: string; // fixed for the culprit, generated otherwise
}

/** 21 deploys over 7 days. dep-4c21 is the culprit; dep-77a9/dep-2f4c are
 *  innocent same-window candidates; dep-b31d/dep-e0b7 land AFTER alert onset
 *  (timeline red herrings). */
export const DEPLOY_PLAN: DeployPlanItem[] = [
  { id: "dep-9d2f", service: "auth-svc",        hoursAgo: 164, title: "rotate signing keys",           author: "mara" },
  { id: "dep-51cc", service: "search-api",      hoursAgo: 158, title: "index warmup cache",            author: "iris" },
  { id: "dep-a83e", service: "inventory-svc",   hoursAgo: 150, title: "batch stock sync",              author: "noor" },
  { id: "dep-7f10", service: "payment-gateway", hoursAgo: 141, title: "idempotency-key fix",           author: "lena" },
  { id: "dep-c47b", service: "checkout-api",    hoursAgo: 132, title: "coupon validation refactor",    author: "ravi" },
  { id: "dep-2e91", service: "auth-svc",        hoursAgo: 122, title: "token ttl tuning",              author: "mara" },
  { id: "dep-b64d", service: "search-api",      hoursAgo: 110, title: "query planner hints",           author: "iris" },
  { id: "dep-88a2", service: "inventory-svc",   hoursAgo: 98,  title: "warehouse shard rollout",       author: "noor", status: "failed", notes: "auto-rolled back by CD pipeline" },
  { id: "dep-e157", service: "checkout-api",    hoursAgo: 88,  title: "checkout UI flags API",         author: "ravi" },
  { id: "dep-40fc", service: "payment-gateway", hoursAgo: 76,  title: "retry storm damping",           author: "lena" },
  { id: "dep-d318", service: "search-api",      hoursAgo: 66,  title: "typo-tolerant scoring",         author: "iris" },
  { id: "dep-6b95", service: "auth-svc",        hoursAgo: 54,  title: "webauthn GA",                   author: "mara" },
  { id: "dep-f02a", service: "inventory-svc",   hoursAgo: 46,  title: "ledger compaction job",         author: "noor" },
  { id: "dep-19e6", service: "checkout-api",    hoursAgo: 38,  title: "shipping rate cache",           author: "ravi" },
  { id: "dep-77a9", service: "checkout-api",    hoursAgo: 30,  title: "bump retry limit to 3",         author: "ravi" },
  { id: "dep-2f4c", service: "inventory-svc",   hoursAgo: 28,  title: "reorder point config",          author: "noor" },
  { id: CULPRIT_DEPLOY_ID, service: "checkout-api", hoursAgo: 26, title: "cut upstream timeout budget to 800ms", author: "ravi", commit: "9f3ab12" },
  { id: "dep-b31d", service: "payment-gateway", hoursAgo: 24,  title: "charge api log sampling",       author: "lena" },
  { id: "dep-e0b7", service: "checkout-api",    hoursAgo: 12,  title: "log sampling tweak",            author: "ravi" },
  { id: "dep-ca55", service: "search-api",      hoursAgo: 7,   title: "synonym pack update",           author: "iris" },
  { id: "dep-3d80", service: "auth-svc",        hoursAgo: 3,   title: "session store upgrade",         author: "mara" },
];

export interface AlertPlanItem {
  id: string;
  name: string;
  source: string;
  service: string;
  severity: "critical" | "warning" | "info";
  status: "firing" | "resolved";
  hoursAgo: number;
  minuteOffset: number;
  title: string;
  payload: Record<string, unknown>;
}

export const ALERT_PLAN: AlertPlanItem[] = [
  {
    id: "alrt-0001",
    name: "payment-failures",
    source: "payment-gateway",
    service: "payment-gateway",
    severity: "critical",
    status: "firing",
    hoursAgo: 25,
    minuteOffset: 4,
    title: "Payment failure rate above 5% SLO on POST /v1/charge",
    payload: {
      slo: "error_rate(POST /v1/charge) < 1% over 1h",
      current: { error_rate: 0.068, p99_ms: 1180, requests_per_min: 14 },
      window: "last 60m",
      suspected_scope: ["payment-gateway", "checkout-api"],
      runbook: "https://runbooks.internal/incidents/payment-failures",
      note: "Failure mode is upstream timeout, not card declines.",
    },
  },
  {
    id: "alrt-0002",
    name: "checkout-timeouts",
    source: "checkout-api",
    service: "checkout-api",
    severity: "warning",
    status: "firing",
    hoursAgo: 24,
    minuteOffset: 52,
    title: "P99 latency > 2s on POST /v1/checkout",
    payload: {
      current: { p99_ms: 2710, error_rate: 0.104 },
      window: "last 60m",
      runbook: "https://runbooks.internal/incidents/checkout-timeouts",
    },
  },
  {
    id: "alrt-0482",
    name: "inventory-db-pool",
    source: "inventory-svc",
    service: "inventory-svc",
    severity: "warning",
    status: "resolved",
    hoursAgo: 70,
    minuteOffset: 12,
    title: "DB connection pool saturation 92% on inventory-svc",
    payload: { resolved_by: "connection pool resize", duration_min: 41 },
  },
  {
    id: "alrt-0101",
    name: "search-error-drift",
    source: "search-api",
    service: "search-api",
    severity: "info",
    status: "resolved",
    hoursAgo: 96,
    minuteOffset: 30,
    title: "Error rate drift +0.4% on GET /v1/search",
    payload: { resolved_by: "tuned query timeouts", duration_min: 18 },
  },
];