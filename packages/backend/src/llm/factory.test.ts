import { afterAll, beforeEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { createPool } from "../db/pool.js";
import { SecretCrypto } from "../crypto/secret-crypto.js";
import { resetAndMigrate } from "../repositories/postgres/fixtures.js";
import { PostgresAdminSettingsRepository } from "../repositories/postgres/postgres-admin-settings-repository.js";
import { PostgresUserMappingRepository } from "../repositories/postgres/postgres-user-mapping-repository.js";
import { LLMFactory, LLM_SETTING_KEYS } from "./factory.js";
import { LLMError } from "./types.js";
import { QwenClient } from "./providers/qwen.js";
import { OpenAIClient } from "./providers/openai.js";
import { AnthropicClient } from "./providers/anthropic.js";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = typeof DATABASE_URL === "string" && DATABASE_URL.length > 0;
const d = hasDb ? describe : describe.skip;

d("LLMFactory", () => {
  let sql: postgres.Sql;
  let settings: PostgresAdminSettingsRepository;
  let factory: LLMFactory;
  let adminId: number;

  beforeAll(async () => {
    sql = createPool({ connectionString: DATABASE_URL, max: 2 });
    await resetAndMigrate(sql);
    const crypto = new SecretCrypto(randomBytes(32));
    settings = new PostgresAdminSettingsRepository(sql, crypto);
    const users = new PostgresUserMappingRepository(sql);
    adminId = (await users.getOrCreate(`llm-admin-${Math.random()}`)).id;
    factory = new LLMFactory(settings);
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    // Clear LLM settings between tests.
    for (const p of ["qwen", "openai", "anthropic"] as const) {
      await settings.delete(LLM_SETTING_KEYS.api_key(p));
      await settings.delete(LLM_SETTING_KEYS.model(p));
      await settings.delete(LLM_SETTING_KEYS.base_url(p));
    }
    await settings.delete(LLM_SETTING_KEYS.active_provider);
  });

  it("throws provider_unknown when no active provider is configured", async () => {
    await expect(factory.buildClient()).rejects.toMatchObject({
      name: "LLMError",
      code: "provider_unknown",
    });
  });

  it("throws provider_unknown when active_provider is not a valid value", async () => {
    await settings.upsert({
      key: LLM_SETTING_KEYS.active_provider,
      value: "bogus",
      is_secret: false,
      updated_by: adminId,
    });
    await expect(factory.buildClient()).rejects.toMatchObject({
      code: "provider_unknown",
    });
  });

  it("throws invalid_api_key when the active provider has no api_key", async () => {
    await settings.upsert({
      key: LLM_SETTING_KEYS.active_provider,
      value: "qwen",
      is_secret: false,
      updated_by: adminId,
    });
    const err = (await factory.buildClient().catch((e: unknown) => e)) as LLMError;
    expect(err).toBeInstanceOf(LLMError);
    expect(err.code).toBe("invalid_api_key");
    expect(err.provider).toBe("qwen");
  });

  it("builds a QwenClient when provider=qwen and api_key is set", async () => {
    await settings.upsert({
      key: LLM_SETTING_KEYS.active_provider,
      value: "qwen",
      is_secret: false,
      updated_by: adminId,
    });
    await settings.upsert({
      key: LLM_SETTING_KEYS.api_key("qwen"),
      value: "sk-q",
      is_secret: true,
      updated_by: adminId,
    });
    const client = await factory.buildClient();
    expect(client).toBeInstanceOf(QwenClient);
    expect(client.provider).toBe("qwen");
    expect(client.model).toBe("qwen-plus");
  });

  it("honours per-provider model override", async () => {
    await settings.upsert({
      key: LLM_SETTING_KEYS.active_provider,
      value: "qwen",
      is_secret: false,
      updated_by: adminId,
    });
    await settings.upsert({
      key: LLM_SETTING_KEYS.api_key("qwen"),
      value: "sk-q",
      is_secret: true,
      updated_by: adminId,
    });
    await settings.upsert({
      key: LLM_SETTING_KEYS.model("qwen"),
      value: "qwen-max",
      is_secret: false,
      updated_by: adminId,
    });
    const client = await factory.buildClient();
    expect(client.model).toBe("qwen-max");
  });

  it("builds an OpenAIClient when provider=openai", async () => {
    await settings.upsert({
      key: LLM_SETTING_KEYS.active_provider,
      value: "openai",
      is_secret: false,
      updated_by: adminId,
    });
    await settings.upsert({
      key: LLM_SETTING_KEYS.api_key("openai"),
      value: "sk-o",
      is_secret: true,
      updated_by: adminId,
    });
    const client = await factory.buildClient();
    expect(client).toBeInstanceOf(OpenAIClient);
    expect(client.provider).toBe("openai");
  });

  it("builds an AnthropicClient when provider=anthropic", async () => {
    await settings.upsert({
      key: LLM_SETTING_KEYS.active_provider,
      value: "anthropic",
      is_secret: false,
      updated_by: adminId,
    });
    await settings.upsert({
      key: LLM_SETTING_KEYS.api_key("anthropic"),
      value: "sk-a",
      is_secret: true,
      updated_by: adminId,
    });
    const client = await factory.buildClient();
    expect(client).toBeInstanceOf(AnthropicClient);
    expect(client.provider).toBe("anthropic");
  });

  it("re-reads settings on every buildClient call (no internal cache)", async () => {
    // Start on qwen.
    await settings.upsert({
      key: LLM_SETTING_KEYS.active_provider,
      value: "qwen",
      is_secret: false,
      updated_by: adminId,
    });
    await settings.upsert({
      key: LLM_SETTING_KEYS.api_key("qwen"),
      value: "sk-q",
      is_secret: true,
      updated_by: adminId,
    });
    const first = await factory.buildClient();
    expect(first.provider).toBe("qwen");

    // Admin switches to openai without a server restart.
    await settings.upsert({
      key: LLM_SETTING_KEYS.active_provider,
      value: "openai",
      is_secret: false,
      updated_by: adminId,
    });
    await settings.upsert({
      key: LLM_SETTING_KEYS.api_key("openai"),
      value: "sk-o",
      is_secret: true,
      updated_by: adminId,
    });
    const second = await factory.buildClient();
    expect(second.provider).toBe("openai");
  });
});
