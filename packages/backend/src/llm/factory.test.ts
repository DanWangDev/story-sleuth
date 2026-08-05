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
    await settings.delete(LLM_SETTING_KEYS.provider);
    await settings.delete(LLM_SETTING_KEYS.model);
    await settings.delete(LLM_SETTING_KEYS.api_key);
    await settings.delete(LLM_SETTING_KEYS.base_url);
    await settings.delete(LLM_SETTING_KEYS.providers);
  });

  it("throws provider_unknown when no provider is configured", async () => {
    await expect(factory.buildClient()).rejects.toMatchObject({
      name: "LLMError",
      code: "provider_unknown",
    });
  });

  it("throws provider_unknown when provider is not valid", async () => {
    await settings.upsert({
      key: LLM_SETTING_KEYS.provider,
      value: "bogus",
      is_secret: false,
      updated_by: adminId,
    });
    await expect(factory.buildClient()).rejects.toMatchObject({
      code: "provider_unknown",
    });
  });

  it("throws invalid_api_key when no api_key is configured", async () => {
    await settings.upsert({
      key: LLM_SETTING_KEYS.provider,
      value: "qwen",
      is_secret: false,
      updated_by: adminId,
    });
    const err = (await factory.buildClient().catch((e: unknown) => e)) as LLMError;
    expect(err).toBeInstanceOf(LLMError);
    expect(err.code).toBe("invalid_api_key");
    expect(err.provider).toBe("qwen");
  });

  it("builds an OpenAIClient for qwen (uses defaults)", async () => {
    await settings.upsert({
      key: LLM_SETTING_KEYS.provider,
      value: "qwen",
      is_secret: false,
      updated_by: adminId,
    });
    await settings.upsert({
      key: LLM_SETTING_KEYS.api_key,
      value: "sk-q",
      is_secret: true,
      updated_by: adminId,
    });
    const client = await factory.buildClient();
    expect(client).toBeInstanceOf(OpenAIClient);
    expect(client.provider).toBe("qwen");
    expect(client.model).toBe("qwen-plus"); // from DEFAULTS
  });

  it("honours global model override for qwen", async () => {
    await settings.upsert({
      key: LLM_SETTING_KEYS.provider,
      value: "qwen",
      is_secret: false,
      updated_by: adminId,
    });
    await settings.upsert({
      key: LLM_SETTING_KEYS.api_key,
      value: "sk-q",
      is_secret: true,
      updated_by: adminId,
    });
    await settings.upsert({
      key: LLM_SETTING_KEYS.model,
      value: "qwen-max",
      is_secret: false,
      updated_by: adminId,
    });
    const client = await factory.buildClient();
    expect(client.model).toBe("qwen-max");
  });

  it("builds an OpenAIClient for openai", async () => {
    await settings.upsert({
      key: LLM_SETTING_KEYS.provider,
      value: "openai",
      is_secret: false,
      updated_by: adminId,
    });
    await settings.upsert({
      key: LLM_SETTING_KEYS.api_key,
      value: "sk-o",
      is_secret: true,
      updated_by: adminId,
    });
    const client = await factory.buildClient();
    expect(client).toBeInstanceOf(OpenAIClient);
    expect(client.provider).toBe("openai");
    expect(client.model).toBe("gpt-4o-mini"); // from DEFAULTS
  });

  it("builds an AnthropicClient for anthropic", async () => {
    await settings.upsert({
      key: LLM_SETTING_KEYS.provider,
      value: "anthropic",
      is_secret: false,
      updated_by: adminId,
    });
    await settings.upsert({
      key: LLM_SETTING_KEYS.api_key,
      value: "sk-a",
      is_secret: true,
      updated_by: adminId,
    });
    const client = await factory.buildClient();
    expect(client).toBeInstanceOf(AnthropicClient);
    expect(client.provider).toBe("anthropic");
  });

  it("builds an OpenAIClient for deepseek", async () => {
    await settings.upsert({
      key: LLM_SETTING_KEYS.provider,
      value: "deepseek",
      is_secret: false,
      updated_by: adminId,
    });
    await settings.upsert({
      key: LLM_SETTING_KEYS.api_key,
      value: "sk-d",
      is_secret: true,
      updated_by: adminId,
    });
    const client = await factory.buildClient();
    expect(client).toBeInstanceOf(OpenAIClient);
    expect(client.provider).toBe("deepseek");
  });

  it("builds an OpenAIClient for kimi", async () => {
    await settings.upsert({
      key: LLM_SETTING_KEYS.provider,
      value: "kimi",
      is_secret: false,
      updated_by: adminId,
    });
    await settings.upsert({
      key: LLM_SETTING_KEYS.api_key,
      value: "sk-k",
      is_secret: true,
      updated_by: adminId,
    });
    const client = await factory.buildClient();
    expect(client).toBeInstanceOf(OpenAIClient);
    expect(client.provider).toBe("kimi");
  });

  it("builds an OpenAIClient for glm", async () => {
    await settings.upsert({
      key: LLM_SETTING_KEYS.provider,
      value: "glm",
      is_secret: false,
      updated_by: adminId,
    });
    await settings.upsert({
      key: LLM_SETTING_KEYS.api_key,
      value: "sk-g",
      is_secret: true,
      updated_by: adminId,
    });
    const client = await factory.buildClient();
    expect(client).toBeInstanceOf(OpenAIClient);
    expect(client.provider).toBe("glm");
  });

  it("re-reads settings on every buildClient call (no internal cache)", async () => {
    await settings.upsert({
      key: LLM_SETTING_KEYS.provider,
      value: "qwen",
      is_secret: false,
      updated_by: adminId,
    });
    await settings.upsert({
      key: LLM_SETTING_KEYS.api_key,
      value: "sk-q",
      is_secret: true,
      updated_by: adminId,
    });
    const first = await factory.buildClient();
    expect(first.provider).toBe("qwen");

    await settings.upsert({
      key: LLM_SETTING_KEYS.provider,
      value: "openai",
      is_secret: false,
      updated_by: adminId,
    });
    await settings.upsert({
      key: LLM_SETTING_KEYS.api_key,
      value: "sk-o",
      is_secret: true,
      updated_by: adminId,
    });
    const second = await factory.buildClient();
    expect(second.provider).toBe("openai");
  });
});
