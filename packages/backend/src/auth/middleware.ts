import type { RequestHandler } from "express";
import type { UserMappingRepository } from "../repositories/interfaces/user-mapping-repository.js";
import type { JwtVerifier } from "./jwt-verifier.js";
import { JwtVerificationError } from "./jwt-verifier.js";
import type { HubClaims } from "./claims.js";

/** The minimum story-sleuth needs attached to an authenticated request. */
export interface AuthContext {
  /** Local user_mappings.id. Stable FK for student_attempts etc. */
  user_id: number;
  /** Hub-issued claims, re-read on every request — no local profile cache. */
  claims: HubClaims;
}

declare module "express-serve-static-core" {
  // Extend Request with the auth context populated by requireAuth.
  interface Request {
    auth?: AuthContext;
  }
}

export interface AuthMiddlewareOptions {
  verifier: JwtVerifier;
  userMappings: UserMappingRepository;
  /**
   * App slug this service is — the `apps` claim must include it for
   * the token to be considered "subscribed to story-sleuth". Set to
   * e.g. "reading" to match 11plus-hub's plan config.
   */
  required_app_slug?: string;
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;
  const token = header.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Auth middleware: verifies the bearer token, resolves (or creates)
 * the local user_mappings row, and attaches { user_id, claims } to
 * req.auth. Every student-facing endpoint uses this.
 *
 * Returns:
 *   401 if no token, invalid signature, expired, wrong iss/aud, or malformed claims
 *   403 if the token is valid but the user's subscription doesn't cover story-sleuth
 */
export function createRequireAuth(
  opts: AuthMiddlewareOptions,
): RequestHandler {
  return async (req, res, next): Promise<void> => {
    const token = extractBearer(req.headers.authorization);
    if (!token) {
      res.status(401).json({ error: "missing_bearer_token" });
      return;
    }

    let claims: HubClaims;
    try {
      claims = await opts.verifier.verify(token);
    } catch (err: unknown) {
      if (err instanceof JwtVerificationError) {
        res.status(401).json({ error: "invalid_token", reason: err.reason });
        return;
      }
      next(err);
      return;
    }

    if (opts.required_app_slug) {
      const apps = claims.apps ?? [];
      if (!apps.includes(opts.required_app_slug)) {
        res.status(403).json({
          error: "subscription_required",
          required_app: opts.required_app_slug,
        });
        return;
      }
    }

    try {
      const mapping = await opts.userMappings.getOrCreate(claims.sub);
      req.auth = { user_id: mapping.id, claims };
    } catch (err: unknown) {
      next(err);
      return;
    }
    next();
  };
}

/**
 * Admin-only guard. Must be mounted AFTER requireAuth, which populates
 * req.auth. Rejects non-admins with 403.
 */
export const requireAdmin: RequestHandler = (req, res, next): void => {
  if (!req.auth) {
    // Programmer error: requireAuth wasn't mounted before this.
    res.status(500).json({ error: "auth_not_initialised" });
    return;
  }
  if (req.auth.claims.role !== "admin") {
    res.status(403).json({ error: "admin_only" });
    return;
  }
  next();
};
