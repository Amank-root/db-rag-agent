#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# Check Node version >= 22.13.0 using semver comparison
node -e '
  const required = "22.13.0";
  const current = process.version.slice(1);
  const [rMajor, rMinor, rPatch] = required.split(".").map(Number);
  const [cMajor, cMinor, cPatch] = current.split(".").map(Number);
  const ok = cMajor > rMajor || (cMajor === rMajor && cMinor > rMinor) || (cMajor === rMajor && cMinor === rMinor && cPatch >= rPatch);
  if (!ok) {
    console.error(`❌ Node >= 22.13.0 required (found ${current})`);
    process.exit(1);
  }
  console.log(`✅ Node ${current} >= 22.13.0`);
'

# Install root dependencies (tsx, trueforge-sdk for create-agent)
npm install --no-fund --no-audit

# Build and seed deploy-mcp
cd "$ROOT/deploy-mcp"
npm install --no-fund --no-audit
npm run build
npm run seed

echo ""
echo "✅ deploy-mcp built and world seeded."
echo "Next: npx @truefoundry/trueforge → then load connectors/deploy-mcp.json (see README)."