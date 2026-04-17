import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { createAuthRoutes } from "@danwangdev/auth-client/server";
import type { AuthServerConfig } from "@danwangdev/auth-client/server";
import type postgres from "postgres";
import { createHealthRouter } from "./routes/health.js";
import { createSessionsRouter } from "./routes/sessions.js";
import { createAdminSettingsRouter } from "./routes/admin/settings.js";
import { buildAuthConfig } from "./auth/auth-config.js";
import { createRequireAuth, requireAdmin } from "./auth/middleware.js";
import { PostgresUserMappingRepository } from "./repositories/postgres/postgres-user-mapping-repository.js";
import { PostgresPassageRepository } from "./repositories/postgres/postgres-passage-repository.js";
import { PostgresQuestionRepository } from "./repositories/postgres/postgres-question-repository.js";
import { PostgresSessionRepository } from "./repositories/postgres/postgres-session-repository.js";
import { PostgresStudentAttemptRepository } from "./repositories/postgres/postgres-student-attempt-repository.js";
import { PostgresAdminSettingsRepository } from "./repositories/postgres/postgres-admin-settings-repository.js";
import { SessionService } from "./services/session-service.js";
import { SecretCrypto } from "./crypto/secret-crypto.js";
import type { Env } from "./config/env.js";

export interface AppDeps {
  env: Env;
  sql: postgres.Sql;
  authConfigOverride?: AuthServerConfig;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  const authConfig = deps.authConfigOverride ?? buildAuthConfig(deps.env);

  app.use(helmet());
  app.use(
    cors({
      origin: deps.env.CORS_ORIGIN.split(",").map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  /**
   * Auth-client routes at /api/auth:
   *   GET  /api/auth/login
   *   GET  /api/auth/callback
   *   POST /api/auth/logout
   *   GET  /api/auth/me
   *   POST /api/auth/backchannel-logout  (enabled by backchannelLogout: true)
   */
  const authRouter = createAuthRoutes({ ...authConfig, basePath: "/auth" });
  app.use("/api", authRouter);

  // Public health check — never gated.
  app.use("/api", createHealthRouter());

  // Repositories + service wiring.
  const userMappings = new PostgresUserMappingRepository(deps.sql);
  const passages = new PostgresPassageRepository(deps.sql);
  const questions = new PostgresQuestionRepository(deps.sql);
  const sessionRepo = new PostgresSessionRepository(deps.sql);
  const attempts = new PostgresStudentAttemptRepository(deps.sql);
  const crypto = SecretCrypto.fromBase64(deps.env.ADMIN_ENCRYPTION_KEY);
  const adminSettings = new PostgresAdminSettingsRepository(deps.sql, crypto);

  const sessionService = new SessionService(
    passages,
    questions,
    sessionRepo,
    attempts,
  );

  const requireAuth = createRequireAuth({
    config: authConfig,
    userMappings,
    required_app_slug: deps.env.APP_SLUG,
  });

  /**
   * Student session endpoints — every route requires a valid session and
   * a subscription that covers APP_SLUG (checked inside requireAuth).
   */
  app.use("/api/sessions", requireAuth, createSessionsRouter(sessionService));

  /**
   * Admin endpoints — requireAuth then requireAdmin so a valid student
   * token can never reach the settings surface even if they know the URL.
   */
  app.use(
    "/api/admin/settings",
    requireAuth,
    requireAdmin,
    createAdminSettingsRouter(adminSettings),
  );

  return app;
}
