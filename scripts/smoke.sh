#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../deploy-mcp"

npm install --no-fund --no-audit
npm run build
npm test
node dist/seed/seed.js > /dev/null

node --input-type=module -e "
import { queryDb } from './dist/tools/queryDb.js';
const res = await queryDb.handler({ sql: 'SELECT COUNT(*) AS deploys FROM deploys' });
console.log(JSON.parse(res.content[0].text));
"

echo "✅ smoke: build + tests + seed + direct tool call all passed."