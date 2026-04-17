import type { Request, RequestHandler } from "express";
import {
  discoverOidc,
  requireAuth as acRequireAuth,
  optionalAuth as acOptionalAuth,
  isRevoked,
} from "@danwangdev/auth-client/server";
import type { AuthServerConfig } from "@danwangdev/auth-client/server";
import type { HubUser } from "@danwangdev/auth-client/types";
import type { UserMappingRepository } from "../repositories/interfaces/user-mapping-repository.js";

/**
 * Story-sleuth-specific auth state attached to the Express request.
 * Complements auth-client's `req.user` (HubUser) with the local
 * `user_mappings.id` FK so downstream handlers can write to
 * student_attempts / sessions without another DB round trip per request.
 */
export interface AuthContext {
  /** Local user_mappings.id */
  user_id: number;
  /** Hub-issued claims (the source of truth for role + subscription) */
  claims: HubUser;
}

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthContext;
  }
}

export interface AuthMiddlewareDeps {
  config: AuthServerConfig;
  userMappings: UserMappingRepository;
  /**
   * App slug from env (e.g. "reading"). If set, require `apps` claim
   * to include it — enforces that the user's hub subscription covers
   * story-sleuth before any session endpoint will serve them.
   */
  required_app_slug?: string;
}

/**
 * Wraps auth-client's requireAuth to also:
 *   1. Apply the OIDC back-channel logout revocation check — if the
 *      user's `sub` has been marked revoked (hub sent a BCL token),
 *      treat the session as unauthenticated even if the cookie is still
 *      present. auth-client's in-memory revocation set does the tracking.
 *   2. Enforce the subscription gate (apps claim must include our slug).
 *   3. Upsert the local user_mappings row and attach { user_id, claims }
 *      to req.auth.
 */
export function createRequireAuth(deps: AuthMiddlewareDeps): RequestHandler {
  let cached: RequestHandler | null = null;
  async function getInner(): Promise<RequestHandler> {
    if (cached) return cached;
    const metadata = await discoverOidc(
      deps.config.issuer,
      deps.config.internalIssuer,
    );
    cached = acRequireAuth({ config: deps.config, metadata });
    return cached;
  }

  return async (req, res, next) => {
    try {
      const inner = await getInner();
      await new Promise<void>((resolve, reject) => {
        inner(req, res, (err?: unknown) => {
          if (err) reject(err as Error);
          else resolve();
        });
      });
    } catch (err) {
      next(err);
      return;
    }

    // auth-client wrote to response (401, etc.) — don't continue.
    if (res.headersSent) return;

    const hubUser = req.user;
    if (!hubUser) {
      // auth-client sent a 4xx via res; safety net for unexpected paths.
      if (!res.headersSent) res.status(401).json({ error: "unauthenticated" });
      return;
    }

    // Back-channel logout revocation check. auth-client's session middleware
    // populates req.user from the cookie before we get here, so a stale
    // cookie for a now-revoked sub would otherwise pass. Explicit check.
    if (isRevoked(hubUser.sub)) {
      res.status(401).json({ error: "session_revoked" });
      return;
    }

    if (deps.required_app_slug) {
      const apps = hubUser.apps ?? [];
      if (!apps.includes(deps.required_app_slug)) {
        res.status(403).json({
          error: "subscription_required",
          required_app: deps.required_app_slug,
        });
        return;
      }
    }

    try {
      const mapping = await deps.userMappings.getOrCreate(hubUser.sub);
      req.auth = { user_id: mapping.id, claims: hubUser };
    } catch (err) {
      next(err);
      return;
    }
    next();
  };
}

export function createOptionalAuth(deps: AuthMiddlewareDeps): RequestHandler {
  let cached: RequestHandler | null = null;
  async function getInner(): Promise<RequestHandler> {
    if (cached) return cached;
    const metadata = await discoverOidc(
      deps.config.issuer,
      deps.config.internalIssuer,
    );
    cached = acOptionalAuth({ config: deps.config, metadata });
    return cached;
  }

  return async (req, res, next) => {
    try {
      const inner = await getInner();
      await new Promise<void>((resolve, reject) => {
        inner(req, res, (err?: unknown) => {
          if (err) reject(err as Error);
          else resolve();
        });
      });
    } catch (err) {
      next(err);
      return;
    }

    if (res.headersSent) return;

    const hubUser = req.user;
    if (!hubUser) {
      next();
      return;
    }
    if (isRevoked(hubUser.sub)) {
      // Treat as unauthenticated but don't block — optionalAuth semantics.
      req.user = undefined;
      next();
      return;
    }
    try {
      const mapping = await deps.userMappings.getOrCreate(hubUser.sub);
      req.auth = { user_id: mapping.id, claims: hubUser };
    } catch (err) {
      next(err);
      return;
    }
    next();
  };
}

/**
 * Admin-only guard. Mount AFTER requireAuth. Rejects non-admins with
 * 403. role is read from the JWT claims, not a local DB — there is no
 * local role state story-sleuth needs to invalidate.
 */
export const requireAdmin: RequestHandler = (req: Request, res, next) => {
  if (!req.auth) {
    res.status(500).json({ error: "auth_not_initialised" });
    return;
  }
  if (req.auth.claims.role !== "admin") {
    res.status(403).json({ error: "admin_only" });
    return;
  }
  next();
};
