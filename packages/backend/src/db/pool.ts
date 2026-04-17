import postgres from "postgres";

/**
 * Singleton Postgres connection pool. Reads DATABASE_URL from the
 * environment. Connection count is intentionally modest at Phase 1 scale;
 * revisit when attempt volume grows (see design doc's Phase 3 note).
 */
let sharedPool: postgres.Sql | null = null;

export interface PoolOptions {
  /** Override the DATABASE_URL (used in tests). */
  connectionString?: string;
  /** Max pool connections. Default 10. */
  max?: number;
}

export function createPool(opts: PoolOptions = {}): postgres.Sql {
  const url = opts.connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. See .env.example for the expected shape.",
    );
  }
  return postgres(url, {
    max: opts.max ?? 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // Intentionally NO camelCase transform: our Zod schemas use snake_case
    // to match SQL column names exactly. One consistent casing across DB
    // rows, JSON payloads, and type definitions avoids a mapping layer.
  });
}

export function getSharedPool(): postgres.Sql {
  if (sharedPool === null) {
    sharedPool = createPool();
  }
  return sharedPool;
}

export async function closeSharedPool(): Promise<void> {
  if (sharedPool !== null) {
    await sharedPool.end({ timeout: 5 });
    sharedPool = null;
  }
}
