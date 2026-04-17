import type { RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { discoverOidc } from "@danwangdev/auth-client/server";

/**
 * Service-to-service auth for the /api/stats endpoint.
 *
 * Contract (from the design doc): 11plus-hub signs a short-lived JWT
 * with its OIDC key and sends it in the Authorization header. Claims:
 *   - iss: hub OIDC issuer (same as user tokens)
 *   - aud: story-sleuth's app slug (so tokens can't be replayed across apps)
 *   - sub: "hub-service" (so a compromised user token can't be replayed here)
 *
 * We verify signature against the hub's JWKS — the same keys we use for
 * student tokens. No shared static secret; one auth codepath to keep
 * audited. Tokens are cached per-JWKS-URI inside jose.
 */

export interface ServiceAuthConfig {
  /** Hub OIDC issuer (public URL used as JWT `iss` claim). */
  issuer: string;
  /** Docker-internal issuer for discovery/JWKS fetch, if different. */
  internal_issuer?: string;
  /** Expected `aud` value. The app's own slug, e.g. "reading". */
  audience: string;
  /** Expected `sub` value. Default: "hub-service". */
  expected_sub?: string;
  /** Override the fetch implementation (tests). */
  fetch_fn?: typeof fetch;
}

export interface HubServiceClaims {
  iss: string;
  aud: string | string[];
  sub: string;
  iat?: number;
  exp?: number;
  /** Raw decoded payload in case handlers want custom claims. */
  [key: string]: unknown;
}

declare module "express-serve-static-core" {
  interface Request {
    service_auth?: HubServiceClaims;
  }
}

function parseBearer(header: string | undefined): string | null {
  if (!header) return null;
  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== "bearer") return null;
  return parts[1] || null;
}

export interface ServiceAuthDeps {
  verify_fn?: (token: string) => Promise<HubServiceClaims>;
}

/**
 * Builds an Express middleware that admits only requests carrying a
 * valid hub-signed service JWT. Tokens with a user `sub` are rejected
 * — this endpoint is not for end users even if they happen to have a
 * valid access token.
 */
export function createRequireHubService(
  config: ServiceAuthConfig,
  deps: ServiceAuthDeps = {},
): RequestHandler {
  const expected_sub = config.expected_sub ?? "hub-service";

  let verifyFn: ((token: string) => Promise<HubServiceClaims>) | null =
    deps.verify_fn ?? null;
  let initPromise: Promise<(token: string) => Promise<HubServiceClaims>> | null =
    null;

  async function getVerify(): Promise<
    (token: string) => Promise<HubServiceClaims>
  > {
    if (verifyFn) return verifyFn;
    if (!initPromise) {
      initPromise = (async () => {
        const metadata = await discoverOidc(
          config.issuer,
          config.internal_issuer,
          config.fetch_fn,
        );
        const jwks = createRemoteJWKSet(new URL(metadata.jwks_uri));
        const fn = async (token: string): Promise<HubServiceClaims> => {
          const { payload } = await jwtVerify(token, jwks, {
            issuer: config.issuer,
            audience: config.audience,
          });
          return payload as HubServiceClaims;
        };
        verifyFn = fn;
        return fn;
      })();
    }
    return initPromise;
  }

  return async (req, res, next) => {
    const token = parseBearer(req.header("authorization"));
    if (!token) {
      res.status(401).json({ error: "missing_bearer_token" });
      return;
    }

    let claims: HubServiceClaims;
    try {
      const verify = await getVerify();
      claims = await verify(token);
    } catch {
      res.status(401).json({ error: "invalid_service_token" });
      return;
    }

    if (claims.sub !== expected_sub) {
      res.status(403).json({
        error: "wrong_token_subject",
        expected: expected_sub,
      });
      return;
    }

    req.service_auth = claims;
    next();
  };
}
