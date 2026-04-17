import {
  createRemoteJWKSet,
  createLocalJWKSet,
  jwtVerify,
  type JWTPayload,
  type JSONWebKeySet,
} from "jose";
import { HubClaimsSchema, type HubClaims } from "./claims.js";

export interface VerifierConfig {
  /**
   * URL of the hub's JWKS endpoint, e.g. "https://hub.labf.app/.well-known/jwks.json".
   * Production uses this.
   */
  jwks_url?: string;

  /**
   * Inline JWKS object. Tests use this to verify against an in-memory
   * key pair without spinning up an HTTP mock.
   */
  jwks?: JSONWebKeySet;

  /** Expected `iss` claim — e.g. "https://hub.labf.app". */
  issuer: string;

  /** Expected `aud` claim — e.g. "story-sleuth" (hub's client_id for this app). */
  audience: string;
}

export class JwtVerificationError extends Error {
  constructor(
    message: string,
    readonly reason: "invalid_signature" | "expired" | "wrong_issuer" | "wrong_audience" | "malformed_claims" | "unknown",
  ) {
    super(message);
    this.name = "JwtVerificationError";
  }
}

/**
 * Verifies a hub-signed JWT and returns the validated claims. Throws
 * `JwtVerificationError` on any failure (expired, wrong signer,
 * mismatched aud/iss, missing required claims).
 *
 * Implements the design doc's JWT validation requirement:
 *   - Signature verified against the hub's public keys (via JWKS)
 *   - iss + aud checked
 *   - exp enforced by jose
 *   - Claims shape validated by Zod
 */
export class JwtVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet>;

  constructor(private readonly config: VerifierConfig) {
    if (config.jwks) {
      this.jwks = createLocalJWKSet(config.jwks);
    } else if (config.jwks_url) {
      this.jwks = createRemoteJWKSet(new URL(config.jwks_url));
    } else {
      throw new Error("JwtVerifier requires either `jwks` or `jwks_url`");
    }
  }

  async verify(token: string): Promise<HubClaims> {
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, this.jwks, {
        issuer: this.config.issuer,
        audience: this.config.audience,
      });
      payload = result.payload;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "ERR_JWT_EXPIRED") {
        throw new JwtVerificationError("token expired", "expired");
      }
      if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED") {
        const claim = (err as { claim?: string }).claim ?? "";
        if (claim === "iss") {
          throw new JwtVerificationError("wrong issuer", "wrong_issuer");
        }
        if (claim === "aud") {
          throw new JwtVerificationError("wrong audience", "wrong_audience");
        }
      }
      if (code.startsWith("ERR_JWS") || code === "ERR_JWKS_NO_MATCHING_KEY") {
        throw new JwtVerificationError("invalid signature", "invalid_signature");
      }
      throw new JwtVerificationError(
        `token verification failed: ${(err as Error).message ?? String(err)}`,
        "unknown",
      );
    }

    const parsed = HubClaimsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new JwtVerificationError(
        `token claims do not match expected shape: ${parsed.error.message}`,
        "malformed_claims",
      );
    }
    return parsed.data;
  }
}
