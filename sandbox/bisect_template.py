#!/usr/bin/env python3
"""Deploy Detective — sandbox bisect template.

The agent embeds data fetched via deploy-mcp into CANDIDATES below, then runs
this script in the sandbox. The culprit is COMPUTED from metrics, never guessed.
"""
import json

# ---- injected by the agent (from deploy_stats / query_db) -------------------
CANDIDATES = [
    # {
    #   "id": "dep-....", "service": "...", "started_at": "...",
    #   "pre_error_rate": 0.008, "post_error_rate": 0.083,
    # },
]
# -----------------------------------------------------------------------------


def rank(candidates):
    scored = []
    for c in candidates:
        pre = max(float(c["pre_error_rate"]), 1e-9)
        post = float(c["post_error_rate"])
        scored.append(
            {
                **c,
                "delta_error_rate": round(post - float(c["pre_error_rate"]), 6),
                "ratio": round(post / pre, 2),
            }
        )
    scored.sort(key=lambda c: c["delta_error_rate"], reverse=True)
    return scored


def main():
    ranked = rank(CANDIDATES)
    if not ranked:
        print(json.dumps({"verdict": "no-candidates"}))
        return
    top = ranked[0]
    verdict = {
        "verdict": "culprit-found",
        "culprit": top["id"],
        "service": top["service"],
        "started_at": top["started_at"],
        "delta_error_rate": top["delta_error_rate"],
        "ratio": top["ratio"],
        "runner_up": ranked[1]["id"] if len(ranked) > 1 else None,
        "ranking": [{"id": c["id"], "delta": c["delta_error_rate"]} for c in ranked],
        "recommendation": f"Roll back {top['id']} ({top['service']}) — pending human approval.",
    }
    print(json.dumps(verdict, indent=2))


if __name__ == "__main__":
    main()