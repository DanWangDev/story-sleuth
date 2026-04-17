import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope for admin_settings secrets (LLM API keys etc.).
 *
 * Format: base64( iv(12) || authTag(16) || ciphertext )
 *
 * Not a full KMS — the key lives in ADMIN_ENCRYPTION_KEY and must be
 * 32 bytes. Rotating the key requires a manual re-encrypt pass over
 * the table; that's intentional and documented in TODOS when we grow
 * to needing rotation.
 */
export class SecretCrypto {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) {
      throw new Error(
        `ADMIN_ENCRYPTION_KEY must decode to exactly 32 bytes, got ${key.length}`,
      );
    }
  }

  static fromBase64(b64: string): SecretCrypto {
    const key = Buffer.from(b64, "base64");
    return new SecretCrypto(key);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ct = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString("base64");
  }

  decrypt(payload: string): string {
    const buf = Buffer.from(payload, "base64");
    if (buf.length < 12 + 16 + 1) {
      throw new Error("ciphertext is truncated or malformed");
    }
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  }
}
