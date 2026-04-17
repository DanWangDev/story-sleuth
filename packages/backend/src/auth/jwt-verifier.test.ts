import { describe, it, expect, beforeAll } from "vitest";
import { JwtVerifier, JwtVerificationError } from "./jwt-verifier.js";
import { makeTestSigner, type TestSigner } from "./test-helpers.js";

describe("JwtVerifier", () => {
  let signer: TestSigner;
  let verifier: JwtVerifier;

  beforeAll(async () => {
    signer = await makeTestSigner();
    verifier = new JwtVerifier({
      jwks: signer.jwks,
      issuer: signer.issuer,
      audience: signer.audience,
    });
  });

  it("accepts a well-formed, in-date, correctly-signed token", async () => {
    const token = await signer.sign({ sub: "user-123", role: "student" });
    const claims = await verifier.verify(token);
    expect(claims.sub).toBe("user-123");
    expect(claims.role).toBe("student");
  });

  it("accepts tokens with role=admin and apps claim", async () => {
    const token = await signer.sign({
      sub: "admin-1",
      role: "admin",
      apps: ["reading", "writing"],
    });
    const claims = await verifier.verify(token);
    expect(claims.role).toBe("admin");
    expect(claims.apps).toEqual(["reading", "writing"]);
  });

  it("rejects an expired token", async () => {
    const token = await signer.sign(
      { sub: "u1", role: "student" },
      { expiresIn: "-1m" },
    );
    await expect(verifier.verify(token)).rejects.toMatchObject({
      name: "JwtVerificationError",
      reason: "expired",
    });
  });

  it("rejects a token signed by a different issuer", async () => {
    const other = await makeTestSigner({ issuer: "https://evil.example" });
    const token = await other.sign({ sub: "u1", role: "student" });
    // Verifier is configured for the legit signer; the wrong-iss token
    // won't even match a key in our JWKS, surfacing as invalid_signature.
    await expect(verifier.verify(token)).rejects.toMatchObject({
      name: "JwtVerificationError",
    });
  });

  it("rejects a token with the wrong issuer claim but the right key", async () => {
    const token = await signer.sign(
      { sub: "u1", role: "student" },
      { issuer: "https://attacker.example" },
    );
    await expect(verifier.verify(token)).rejects.toMatchObject({
      reason: "wrong_issuer",
    });
  });

  it("rejects a token with the wrong audience", async () => {
    const token = await signer.sign(
      { sub: "u1", role: "student" },
      { audience: "writing-buddy" },
    );
    await expect(verifier.verify(token)).rejects.toMatchObject({
      reason: "wrong_audience",
    });
  });

  it("rejects a token with a garbled signature", async () => {
    const token = await signer.sign({ sub: "u1", role: "student" });
    const tampered = `${token.slice(0, -5)}XXXXX`;
    await expect(verifier.verify(tampered)).rejects.toMatchObject({
      name: "JwtVerificationError",
    });
  });

  it("rejects claims missing required fields", async () => {
    const token = await signer.sign({ role: "student" }); // no sub
    await expect(verifier.verify(token)).rejects.toMatchObject({
      reason: "malformed_claims",
    });
  });

  it("rejects claims with an unknown role", async () => {
    const token = await signer.sign({ sub: "u1", role: "superadmin" });
    await expect(verifier.verify(token)).rejects.toMatchObject({
      reason: "malformed_claims",
    });
  });

  it("fails construction with neither jwks nor jwks_url", () => {
    expect(
      () => new JwtVerifier({ issuer: "x", audience: "y" } as never),
    ).toThrow();
  });

  it("JwtVerificationError carries the reason code", () => {
    const err = new JwtVerificationError("bad", "expired");
    expect(err.reason).toBe("expired");
    expect(err.message).toBe("bad");
  });
});
