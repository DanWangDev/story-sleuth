#!/usr/bin/env node
/**
 * CLI entrypoint for the migration runner. Invoked by `npm run migrate`
 * (dev, via tsx) and `npm run migrate:prod` (built, via node dist/).
 * Kept separate from migrate.ts so importing the library doesn't
 * trigger side-effects.
 */
import { runMigrations } from "./migrate.js";

runMigrations().catch((err: unknown) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
