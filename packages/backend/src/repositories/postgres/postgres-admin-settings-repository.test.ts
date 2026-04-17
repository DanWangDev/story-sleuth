import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { createPool } from "../../db/pool.js";
import { SecretCrypto } from "../../crypto/secret-crypto.js";
import { resetAndMigrate } from "./fixtures.js";
import { PostgresAdminSettingsRepository } from "./postgres-admin-settings-repository.js";
import { PostgresUserMappingRepository } from "./postgres-user-mapping-repository.js";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = typeof DATABASE_URL === "string" && DATABASE_URL.length > 0;
const d = hasDb ? describe : describe.skip;

d("PostgresAdminSettingsRepository", () => {
  let sql: postgres.Sql;
  let repo: PostgresAdminSettingsRepository;
  let adminId: number;

  beforeAll(async () => {
    sql = createPool({ connectionString: DATABASE_URL, max: 2 });
    await resetAndMigrate(sql);
    const crypto = new SecretCrypto(randomBytes(32));
    repo = new PostgresAdminSettingsRepository(sql, crypto);
    const users = new PostgresUserMappingRepository(sql);
    const admin = await users.getOrCreate(`settings-admin-${Math.random()}`);
    adminId = admin.id;
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("get returns null for a missing key", async () => {
    expect(await repo.get("missing-xyz")).toBeNull();
  });

  it("upsert inserts a new setting and get round-trips the plaintext", async () => {
    const row = await repo.upsert({
      key: "llm.provider",
      value: "qwen",
      is_secret: false,
      updated_by: adminId,
    });
    expect(row.value).toBe("qwen");
    expect(row.is_secret).toBe(false);
    expect(row.updated_by).toBe(adminId);

    const back = await repo.get("llm.provider");
    expect(back?.value).toBe("qwen");
  });

  it("secrets are stored encrypted on the wire (no plaintext in value column)", async () => {
    await repo.upsert({
      key: "llm.qwen.api_key",
      value: "sk-qwen-supersecret",
      is_secret: true,
      updated_by: adminId,
    });

    const raw = await sql<{ value: string }[]>`
      SELECT value FROM admin_settings WHERE key = 'llm.qwen.api_key'
    `;
    // The stored ciphertext must not contain the plaintext key material.
    expect(raw[0]?.value).not.toContain("sk-qwen-supersecret");
    // And it should be base64 — non-trivial length, decodable.
    expect(raw[0]?.value.length).toBeGreaterThan(20);

    const back = await repo.get("llm.qwen.api_key");
    expect(back?.value).toBe("sk-qwen-supersecret");
    expect(back?.is_secret).toBe(true);
  });

  it("upsert updates existing rows and bumps updated_at", async () => {
    await repo.upsert({
      key: "llm.provider",
      value: "qwen",
      is_secret: false,
      updated_by: adminId,
    });
    const v1 = await repo.get("llm.provider");
    await new Promise((r) => setTimeout(r, 10));
    await repo.upsert({
      key: "llm.provider",
      value: "openai",
      is_secret: false,
      updated_by: adminId,
    });
    const v2 = await repo.get("llm.provider");
    expect(v2?.value).toBe("openai");
    expect(new Date(v2!.updated_at).getTime()).toBeGreaterThan(
      new Date(v1!.updated_at).getTime(),
    );
  });

  it("getMany returns a map keyed by the requested keys", async () => {
    await repo.upsert({
      key: "foo",
      value: "1",
      is_secret: false,
      updated_by: adminId,
    });
    await repo.upsert({
      key: "bar",
      value: "2",
      is_secret: false,
      updated_by: adminId,
    });
    const map = await repo.getMany(["foo", "bar", "missing"]);
    expect(map.size).toBe(2);
    expect(map.get("foo")?.value).toBe("1");
    expect(map.get("bar")?.value).toBe("2");
    expect(map.has("missing")).toBe(false);
  });

  it("getMany returns empty map for empty input", async () => {
    const map = await repo.getMany([]);
    expect(map.size).toBe(0);
  });

  it("delete removes the row", async () => {
    await repo.upsert({
      key: "zap",
      value: "to-delete",
      is_secret: false,
      updated_by: adminId,
    });
    await repo.delete("zap");
    expect(await repo.get("zap")).toBeNull();
  });
});
