import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
/** Works from both src/ (tsx) and dist/ (compiled). */
export const DEFAULT_DB_PATH = path.resolve(here, "..", "data", "incident-world.sqlite");

export function dbPath(): string {
  return process.env.D2_DB_PATH ? path.resolve(process.env.D2_DB_PATH) : DEFAULT_DB_PATH;
}

export function openWorld(opts: { readOnly?: boolean } = {}): DatabaseSync {
  const file = dbPath();
  if (!existsSync(file)) {
    throw new Error(
      `Incident world database not found at ${file}. Build it once with: npm run seed`,
    );
  }
  return new DatabaseSync(file, opts.readOnly ? { readOnly: true } : {});
}