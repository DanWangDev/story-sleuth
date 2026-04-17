import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  type JWK,
  type JSONWebKeySet,
  type KeyLike,
} from "jose";

/**
 * Shared test setup: generate an RSA key pair, produce a JWKS for the
 * verifier, and expose a helper to mint hub-style tokens signed with
 * the private key. No HTTP server, no network, fully in-memory.
 */
export interface TestSigner {
  issuer: string;
  audience: string;
  jwks: JSONWebKeySet;
  sign(claims: Record<string, unknown>, options?: { expiresIn?: string; issuer?: string; audience?: string }): Promise<string>;
}

export async function makeTestSigner(
  overrides: Partial<Pick<TestSigner, "issuer" | "audience">> = {},
): Promise<TestSigner> {
  const issuer = overrides.issuer ?? "https://hub.labf.app";
  const audience = overrides.audience ?? "story-sleuth";
  const kid = "test-kid-1";

  const { publicKey, privateKey } = (await generateKeyPair("RS256", {
    extractable: true,
  })) as { publicKey: KeyLike; privateKey: KeyLike };

  const publicJwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" };
  const jwks: JSONWebKeySet = { keys: [publicJwk] };

  async function sign(
    claims: Record<string, unknown>,
    options: { expiresIn?: string; issuer?: string; audience?: string } = {},
  ): Promise<string> {
    return await new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid })
      .setIssuedAt()
      .setIssuer(options.issuer ?? issuer)
      .setAudience(options.audience ?? audience)
      .setExpirationTime(options.expiresIn ?? "15m")
      .sign(privateKey);
  }

  return { issuer, audience, jwks, sign };
}
