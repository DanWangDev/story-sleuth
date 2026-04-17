import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createPool } from "../../db/pool.js";
import { resetAndMigrate } from "./fixtures.js";
import { PostgresUserMappingRepository } from "./postgres-user-mapping-repository.js";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = typeof DATABASE_URL === "string" && DATABASE_URL.length > 0;
const d = hasDb ? describe : describe.skip;

d("PostgresUserMappingRepository", () => {
  let sql: postgres.Sql;
  let repo: PostgresUserMappingRepository;

  beforeAll(async () => {
    sql = createPool({ connectionString: DATABASE_URL, max: 2 });
    await resetAndMigrate(sql);
    repo = new PostgresUserMappingRepository(sql);
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("findById returns null when the mapping does not exist", async () => {
    expect(await repo.findById(999999)).toBeNull();
  });

  it("findByHubUserId returns null when the hub user is unknown", async () => {
    expect(await repo.findByHubUserId("unknown-sub-xyz")).toBeNull();
  });

  it("getOrCreate creates a new row on first call", async () => {
    const created = await repo.getOrCreate("hub-sub-alpha");
    expect(created.hub_user_id).toBe("hub-sub-alpha");
    expect(created.id).toBeGreaterThan(0);
    expect(typeof created.created_at).toBe("string");
  });

  it("getOrCreate is idempotent — second call returns the same row", async () => {
    const first = await repo.getOrCreate("hub-sub-beta");
    const second = await repo.getOrCreate("hub-sub-beta");
    expect(second.id).toBe(first.id);
    expect(second.created_at).toBe(first.created_at);
  });

  it("findByHubUserId returns the row after getOrCreate", async () => {
    const created = await repo.getOrCreate("hub-sub-gamma");
    const found = await repo.findByHubUserId("hub-sub-gamma");
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
  });

  it("distinct hub_user_ids get distinct local ids", async () => {
    const a = await repo.getOrCreate("hub-sub-one");
    const b = await repo.getOrCreate("hub-sub-two");
    expect(a.id).not.toBe(b.id);
  });
});
