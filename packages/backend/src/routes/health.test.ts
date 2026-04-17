import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type postgres from "postgres";
import type { AuthServerConfig } from "@danwangdev/auth-client/server";
import { createApp } from "../app.js";
import type { Env } from "../config/env.js";
import { createPool } from "../db/pool.js";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = typeof DATABASE_URL === "string" && DATABASE_URL.length > 0;

/**
 * Lightweight stub env values for tests that don't exercise the full
 * config validation path.
 */
const testEnv: Env = {
  NODE_ENV: "test",
  PORT: 5060,
  DATABASE_URL: DATABASE_URL ?? "postgres://localhost/none",
  CORS_ORIGIN: "http://localhost:5180",
  OIDC_ISSUER: "http://localhost:3009",
  OIDC_CLIENT_ID: "story-sleuth-test",
  OIDC_CLIENT_SECRET: "",
  OIDC_REDIRECT_URI: "http://localhost:5180/api/auth/callback",
  SESSION_SECRET: "0".repeat(32),
  APP_SLUG: "reading",
};

/** Minimal auth config that satisfies createAuthRoutes without hitting a real hub. */
const testAuthConfig: AuthServerConfig = {
  issuer: testEnv.OIDC_ISSUER,
  clientId: testEnv.OIDC_CLIENT_ID,
  clientSecret: testEnv.OIDC_CLIENT_SECRET,
  redirectUri: testEnv.OIDC_REDIRECT_URI,
  postLogoutRedirectUri: testEnv.CORS_ORIGIN,
  sessionSecret: testEnv.SESSION_SECRET,
  backchannelLogout: true,
};

describe("GET /api/health", () => {
  let sql: postgres.Sql;

  beforeAll(() => {
    // Create a Sql instance — never actually queried by the health test,
    // but createApp needs a value to pass to repository constructors.
    sql = hasDb
      ? createPool({ connectionString: DATABASE_URL, max: 1 })
      : (null as unknown as postgres.Sql);
  });

  it("returns 200 with ok status and service identifier", async () => {
    if (!hasDb) {
      // No DB available — skip gracefully rather than crash in app ctor.
      return;
    }
    const app = createApp({
      env: testEnv,
      sql,
      authConfigOverride: testAuthConfig,
    });
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("story-sleuth-backend");
    expect(typeof res.body.timestamp).toBe("string");
  });
});
