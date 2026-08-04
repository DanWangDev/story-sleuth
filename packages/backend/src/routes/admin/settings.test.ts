import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from "express";
import request from "supertest";
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { createPool } from "../../db/pool.js";
import { SecretCrypto } from "../../crypto/secret-crypto.js";
import { resetAndMigrate } from "../../repositories/postgres/fixtures.js";
import { PostgresAdminSettingsRepository } from "../../repositories/postgres/postgres-admin-settings-repository.js";
import { PostgresUserMappingRepository } from "../../repositories/postgres/postgres-user-mapping-repository.js";
import { createAdminSettingsRouter } from "./settings.js";
import { requireAdmin, type AuthContext } from "../../auth/middleware.js";
import { LLM_SETTING_KEYS } from "../../llm/factory.js";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = typeof DATABASE_URL === "string" && DATABASE_URL.length > 0;
const d = hasDb ? describe : describe.skip;

/**
 * Test-only auth injector: X-Test-User-Id header + X-Test-Role header.
 * Lets the test exercise requireAdmin without a live hub.
 */
function testAuth(): RequestHandler {
  return (req, res, next) => {
    const hdr = req.headers["x-test-user-id"];
    const role = req.headers["x-test-role"];
    if (typeof hdr !== "string") {
      res.status(401).json({ error: "no test user" });
      return;
    }
    const user_id = Number(hdr);
    (req as Request & { auth?: AuthContext }).auth = {
      user_id,
      claims: {
        sub: `test-sub-${user_id}`,
        role: (typeof role === "string" ? role : "admin") as AuthContext["claims"]["role"],
        apps: ["story-sleuth"],
      } as AuthContext["claims"],
    };
    next();
  };
}

d("Admin /api/admin/settings/llm", () => {
  let sql: postgres.Sql;
  let settings: PostgresAdminSettingsRepository;
  let app: Express;
  let adminId: number;
  let studentId: number;

  beforeAll(async () => {
    sql = createPool({ connectionString: DATABASE_URL, max: 2 });
    await resetAndMigrate(sql);
    const crypto = new SecretCrypto(randomBytes(32));
    settings = new PostgresAdminSettingsRepository(sql, crypto);

    const users = new PostgresUserMappingRepository(sql);
    adminId = (await users.getOrCreate(`admin-${Math.random()}`)).id;
    studentId = (await users.getOrCreate(`student-${Math.random()}`)).id;

    app = express();
    app.use(express.json());
    app.use(
      "/api/admin/settings",
      testAuth(),
      requireAdmin,
      createAdminSettingsRouter(settings),
    );
    app.use(
      (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
        res.status(500).json({ error: err.message });
      },
    );
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await settings.delete(LLM_SETTING_KEYS.provider);
    await settings.delete(LLM_SETTING_KEYS.model);
    await settings.delete(LLM_SETTING_KEYS.api_key);
    await settings.delete(LLM_SETTING_KEYS.base_url);
  });

  it("401 without auth", async () => {
    const res = await request(app).get("/api/admin/settings/llm");
    expect(res.status).toBe(401);
  });

  it("403 for non-admin role", async () => {
    const res = await request(app)
      .get("/api/admin/settings/llm")
      .set("x-test-user-id", String(studentId))
      .set("x-test-role", "student");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("admin_only");
  });

  it("GET returns nulls when nothing is set", async () => {
    const res = await request(app)
      .get("/api/admin/settings/llm")
      .set("x-test-user-id", String(adminId));
    expect(res.status).toBe(200);
    expect(res.body.provider).toBeNull();
    expect(res.body.model).toBeNull();
    expect(res.body.base_url).toBeNull();
    expect(res.body.api_key_tail).toBeNull();
  });

  it("PUT sets provider + api_key; GET reveals only the last-4 tail", async () => {
    const put = await request(app)
      .put("/api/admin/settings/llm")
      .set("x-test-user-id", String(adminId))
      .send({
        provider: "qwen",
        api_key: "sk-qwen-topsecret-1234",
      });
    expect(put.status).toBe(200);
    expect(put.body.provider).toBe("qwen");
    expect(put.body.api_key_tail).toBe("****1234");
    expect(put.body.api_key_tail).not.toContain("topsecret");
  });

  it("PUT validates provider as one of the known set", async () => {
    const res = await request(app)
      .put("/api/admin/settings/llm")
      .set("x-test-user-id", String(adminId))
      .send({ provider: "bogus" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });

  it("PUT is additive — a partial update doesn't clobber unspecified fields", async () => {
    // Seed
    await request(app)
      .put("/api/admin/settings/llm")
      .set("x-test-user-id", String(adminId))
      .send({
        provider: "qwen",
        api_key: "sk-qwen-1111",
        model: "qwen-plus",
      });

    // Update just the model
    const res = await request(app)
      .put("/api/admin/settings/llm")
      .set("x-test-user-id", String(adminId))
      .send({ model: "qwen-max" });

    expect(res.body.provider).toBe("qwen");
    expect(res.body.model).toBe("qwen-max");
    expect(res.body.api_key_tail).toBe("****1111"); // unchanged
  });

  it("PUT persists encrypted — raw value in DB doesn't contain the plaintext key", async () => {
    await request(app)
      .put("/api/admin/settings/llm")
      .set("x-test-user-id", String(adminId))
      .send({ provider: "openai", api_key: "sk-openai-plaintextcheck" });

    const raw = await sql<{ value: string }[]>`
      SELECT value FROM admin_settings WHERE key = 'llm.api_key'
    `;
    expect(raw[0]?.value).not.toContain("plaintextcheck");
    expect(raw[0]?.value).not.toContain("sk-openai");
  });

  it("updated_by records the admin who made the change", async () => {
    await request(app)
      .put("/api/admin/settings/llm")
      .set("x-test-user-id", String(adminId))
      .send({ provider: "openai" });

    const stored = await settings.get(LLM_SETTING_KEYS.provider);
    expect(stored?.updated_by).toBe(adminId);
  });
});
