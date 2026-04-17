import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type postgres from "postgres";
import { createPool } from "./pool.js";

/**
 * A simple forward-only migration runner. SQL files live in
 * `packages/backend/src/db/migrations/` and are named `NNN_description.sql`
 * where `NNN` is a zero-padded sequence number (e.g., `001_user_mappings.sql`).
 *
 * The runner:
 *   1. Ensures a `schema_migrations` tracking table exists.
 *   2. Reads all .sql files in order, skipping ones already applied.
 *   3. Applies each pending migration inside a transaction. A failure
 *      rolls back that migration and halts the run; previously-applied
 *      migrations are untouched.
 *
 * Rollbacks are NOT supported: forward-only migrations remove a category
 * of foot-gun (the "down" script is often wrong) and match how real
 * production schemas evolve. To undo, write a compensating migration.
 */
export interface MigrationRunOptions {
  /** Directory containing NNN_*.sql files. Defaults to this module's sibling. */
  migrationsDir?: string;
  /** Override pool (used in tests). */
  sql?: postgres.Sql;
  /** Silence stdout logging (used in tests). */
  silent?: boolean;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CREATE_TRACKING_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

async function listMigrationFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && /^\d{3}_.+\.sql$/.test(e.name))
    .map((e) => e.name)
    .sort();
}

export async function runMigrations(
  opts: MigrationRunOptions = {},
): Promise<MigrationResult> {
  const migrationsDir = opts.migrationsDir ?? path.join(__dirname, "migrations");
  const sql = opts.sql ?? createPool();
  const log = opts.silent ? () => {} : console.log.bind(console);

  try {
    await sql.unsafe(CREATE_TRACKING_TABLE);

    const applied = (
      await sql<{ version: string }[]>`SELECT version FROM schema_migrations`
    ).map((r) => r.version);
    const appliedSet = new Set(applied);

    const files = await listMigrationFiles(migrationsDir);
    const result: MigrationResult = { applied: [], skipped: [] };

    for (const file of files) {
      if (appliedSet.has(file)) {
        result.skipped.push(file);
        continue;
      }

      log(`[migrate] applying ${file}`);
      const contents = await readFile(path.join(migrationsDir, file), "utf8");

      await sql.begin(async (tx) => {
        await tx.unsafe(contents);
        await tx`INSERT INTO schema_migrations (version) VALUES (${file})`;
      });

      result.applied.push(file);
    }

    log(
      `[migrate] done: ${result.applied.length} applied, ${result.skipped.length} already present`,
    );
    return result;
  } finally {
    if (!opts.sql) {
      // Only close the pool if we created it.
      await sql.end({ timeout: 5 });
    }
  }
}

