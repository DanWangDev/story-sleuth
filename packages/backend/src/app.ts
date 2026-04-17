import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { createAuthRoutes } from "@danwangdev/auth-client/server";
import type { AuthServerConfig } from "@danwangdev/auth-client/server";
import type postgres from "postgres";
import { createHealthRouter } from "./routes/health.js";
import { buildAuthConfig } from "./auth/auth-config.js";
import { createRequireAuth } from "./auth/middleware.js";
import { PostgresUserMappingRepository } from "./repositories/postgres/postgres-user-mapping-repository.js";
import type { Env } from "./config/env.js";

export interface AppDeps {
  env: Env;
  sql: postgres.Sql;
  /**
   * Test seam: injectable override for the auth config. Tests pass a
   * minimal config that points at a mock issuer.
   */
  authConfigOverride?: AuthServerConfig;
}

/**
 * Build the Express app. Pure function — zero side effects (no listen,
 * no DB connect). Tests instantiate multiple apps from different
 * configs cheaply.
 *
 * CORS is deliberately configured with credentials=true because
 * session cookies cross from the frontend origin to this backend.
 */
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
   *   GET  /api/auth/login               — redirect to hub login
   *   GET  /api/auth/callback            — OIDC callback handler
   *   POST /api/auth/logout              — destroys local session, redirects to hub end-session
   *   GET  /api/auth/me                  — current user's claims (JSON)
   *   POST /api/auth/backchannel-logout  — hub-to-app, destroys session for a sub (mounted when backchannelLogout: true)
   */
  const authRouter = createAuthRoutes({ ...authConfig, basePath: "/auth" });
  app.use("/api", authRouter);

  // Public health check — never gated.
  app.use("/api", createHealthRouter());

  // Future: protected session / admin routes mount behind createRequireAuth.
  // They get wired when the session API lands in the next PR. The factory
  // is exported here so each route group can compose its own stack.
  const userMappings = new PostgresUserMappingRepository(deps.sql);
  const requireAuth = createRequireAuth({
    config: authConfig,
    userMappings,
    required_app_slug: deps.env.APP_SLUG,
  });
  app.locals.requireAuth = requireAuth;

  return app;
}
