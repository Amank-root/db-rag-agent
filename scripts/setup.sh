#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

major=$(node -p "process.versions.node.split('.')[0]")
if [ "$major" -lt 22 ]; then
  echo "❌ Node >= 22.13 required (found $(node -v)). Install Node 24 for best results."
  exit 1
fi

cd deploy-mcp
npm install --no-fund --no-audit
npm run build
npm run seed

echo ""
echo "✅ deploy-mcp built and world seeded."
echo "Next: npx @truefoundry/trueforge  → then load connectors/deploy-mcp.json and agent.json (see README)."