import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { createAuthRoutes } from "@danwangdev/auth-client/server";
import type { AuthServerConfig } from "@danwangdev/auth-client/server";
import type postgres from "postgres";
import { createHealthRouter } from "./routes/health.js";
import { createSessionsRouter } from "./routes/sessions.js";
import { createCoachRouter } from "./routes/coach.js";
import { createAdminSettingsRouter } from "./routes/admin/settings.js";
import { createAdminIngestRouter } from "./routes/admin/ingest.js";
import { createAdminContentRouter } from "./routes/admin/content.js";
import { createStatsRouter } from "./routes/stats.js";
import { buildAuthConfig } from "./auth/auth-config.js";
import { createRequireAuth, requireAdmin } from "./auth/middleware.js";
import { createRequireHubService } from "./auth/service-auth.js";
import { PostgresUserMappingRepository } from "./repositories/postgres/postgres-user-mapping-repository.js";
import { PostgresPassageRepository } from "./repositories/postgres/postgres-passage-repository.js";
import { PostgresQuestionRepository } from "./repositories/postgres/postgres-question-repository.js";
import { PostgresSessionRepository } from "./repositories/postgres/postgres-session-repository.js";
import { PostgresStudentAttemptRepository } from "./repositories/postgres/postgres-student-attempt-repository.js";
import { PostgresAdminSettingsRepository } from "./repositories/postgres/postgres-admin-settings-repository.js";
import { PostgresIngestJobRepository } from "./repositories/postgres/postgres-ingest-job-repository.js";
import { SessionService } from "./services/session-service.js";
import { CoachService } from "./services/coach-service.js";
import { SecretCrypto } from "./crypto/secret-crypto.js";
import { LLMFactory } from "./llm/factory.js";
import { ManifestLoader } from "./content/manifest-loader.js";
import { ContentPipeline } from "./content/content-pipeline.js";
import type { Env } from "./config/env.js";

export interface AppDeps {
  env: Env;
  sql: postgres.Sql;
  authConfigOverride?: AuthServerConfig;
  /**
   * Override the service-JWT middleware. Tests inject a stub verifier
   * so we don't need a live hub JWKS endpoint. In production the app
   * builds its own via OIDC discovery against OIDC_ISSUER.
   */
  hubServiceAuthOverride?: import("express").RequestHandler;
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

  const authRouter = createAuthRoutes({ ...authConfig, basePath: "/auth" });
  app.use("/api", authRouter);
  app.use("/api", createHealthRouter());

  // Repositories.
  const userMappings = new PostgresUserMappingRepository(deps.sql);
  const passages = new PostgresPassageRepository(deps.sql);
  const questions = new PostgresQuestionRepository(deps.sql);
  const sessionRepo = new PostgresSessionRepository(deps.sql);
  const attempts = new PostgresStudentAttemptRepository(deps.sql);
  const ingestJobs = new PostgresIngestJobRepository(deps.sql);
  const crypto = SecretCrypto.fromBase64(deps.env.ADMIN_ENCRYPTION_KEY);
  const adminSettings = new PostgresAdminSettingsRepository(deps.sql, crypto);

  // Services.
  const sessionService = new SessionService(
    passages,
    questions,
    sessionRepo,
    attempts,
  );
  const llmFactory = new LLMFactory(adminSettings);
  const coachService = new CoachService(
    sessionRepo,
    attempts,
    questions,
    passages,
    llmFactory,
  );
  const manifestLoader = new ManifestLoader(deps.env.CONTENT_PATH);
  const contentPipeline = new ContentPipeline(
    manifestLoader,
    passages,
    questions,
    ingestJobs,
    llmFactory,
  );

  const requireAuth = createRequireAuth({
    config: authConfig,
    userMappings,
    required_app_slug: deps.env.APP_SLUG,
  });

  // Student endpoints.
  app.use("/api/sessions", requireAuth, createSessionsRouter(sessionService));
  app.use("/api/coach", requireAuth, createCoachRouter(coachService));

  // Admin endpoints — requireAuth then requireAdmin.
  app.use(
    "/api/admin/settings",
    requireAuth,
    requireAdmin,
    createAdminSettingsRouter(adminSettings),
  );
  app.use(
    "/api/admin/ingest",
    requireAuth,
    requireAdmin,
    createAdminIngestRouter(contentPipeline, ingestJobs, manifestLoader),
  );
  app.use(
    "/api/admin/content",
    requireAuth,
    requireAdmin,
    createAdminContentRouter(passages, questions),
  );

  // Service-to-service stats endpoint (hub reads this for its parent
  // dashboard). Auth is a hub-signed JWT, NOT a user session — tokens
  // meant for students won't satisfy requireHubService.
  const requireHubService =
    deps.hubServiceAuthOverride ??
    createRequireHubService({
      issuer: deps.env.OIDC_ISSUER,
      internal_issuer: deps.env.OIDC_INTERNAL_ISSUER,
      audience: deps.env.APP_SLUG,
    });
  app.use(
    "/api/stats",
    requireHubService,
    createStatsRouter(userMappings, attempts),
  );

  return app;
}
