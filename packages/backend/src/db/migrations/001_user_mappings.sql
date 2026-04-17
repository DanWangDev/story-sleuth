-- user_mappings: thin local row per hub-authenticated student.
--
-- Deliberately does NOT store profile data (name, email, role,
-- subscription) — all of that lives in the 11plus-hub JWT claims on
-- each request. This table exists so student_attempts can reference
-- a stable local integer FK instead of carrying the OIDC sub string.
--
-- hub_user_id is the `sub` claim from a hub-issued access token.

CREATE TABLE user_mappings (
  id           BIGSERIAL PRIMARY KEY,
  hub_user_id  TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
