#!/usr/bin/env node
import { buildWorld } from "./build.js";
import { DEFAULT_DB_PATH } from "../world.js";

const file = process.env.D2_DB_PATH ?? DEFAULT_DB_PATH;
const stats = buildWorld(file);
console.log(
  `[deploy-mcp] seeded deterministic world → ${file}\n` +
    `  deploys: ${stats.deploys}  alerts: ${stats.alerts}  metrics rows: ${stats.metrics}`,
);