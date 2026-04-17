-- admin_settings: key-value store for admin-configurable runtime settings.
--
-- The value column holds an AES-256-GCM ciphertext (base64) so secrets
-- like LLM API keys don't sit in plaintext in DB backups, logs, or
-- psql scrollback. Encryption key is derived from ADMIN_ENCRYPTION_KEY
-- env var (32 bytes), kept out of the DB by construction.
--
-- is_secret: when true, the value is never echoed back to the admin UI
-- in full — only the last 4 characters are revealed after save, forcing
-- rotation to go through a fresh write.

CREATE TABLE admin_settings (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL,         -- AES-256-GCM ciphertext, base64
  is_secret    BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   BIGINT REFERENCES user_mappings(id) ON DELETE SET NULL
);
