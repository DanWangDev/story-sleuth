import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { SecretCrypto } from "./secret-crypto.js";

describe("SecretCrypto", () => {
  const key = randomBytes(32).toString("base64");

  it("round-trips plaintext through encrypt + decrypt", () => {
    const crypto = SecretCrypto.fromBase64(key);
    const plain = "sk-qwen-super-secret-token-000";
    const ct = crypto.encrypt(plain);
    expect(ct).not.toBe(plain);
    expect(crypto.decrypt(ct)).toBe(plain);
  });

  it("produces a different ciphertext every time (random IV)", () => {
    const crypto = SecretCrypto.fromBase64(key);
    const plain = "same-secret";
    const a = crypto.encrypt(plain);
    const b = crypto.encrypt(plain);
    expect(a).not.toBe(b);
    expect(crypto.decrypt(a)).toBe(plain);
    expect(crypto.decrypt(b)).toBe(plain);
  });

  it("refuses to decrypt with a different key", () => {
    const a = SecretCrypto.fromBase64(key);
    const b = SecretCrypto.fromBase64(randomBytes(32).toString("base64"));
    const ct = a.encrypt("secret");
    expect(() => b.decrypt(ct)).toThrow();
  });

  it("detects tampered ciphertext via the GCM auth tag", () => {
    const crypto = SecretCrypto.fromBase64(key);
    const ct = crypto.encrypt("secret");
    // Flip one byte in the payload.
    const buf = Buffer.from(ct, "base64");
    buf[buf.length - 1] ^= 0xff;
    expect(() => crypto.decrypt(buf.toString("base64"))).toThrow();
  });

  it("rejects keys that are not exactly 32 bytes", () => {
    expect(() =>
      SecretCrypto.fromBase64(Buffer.alloc(16).toString("base64")),
    ).toThrow(/32 bytes/);
  });

  it("rejects truncated ciphertexts with a clear error", () => {
    const crypto = SecretCrypto.fromBase64(key);
    expect(() => crypto.decrypt("YWE=")).toThrow(/truncated|malformed/);
  });
});
