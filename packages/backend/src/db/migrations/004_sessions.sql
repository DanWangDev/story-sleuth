-- sessions: one row per student practice-or-test session.
--
-- passage_version is PINNED at session-create time. If the admin
-- publishes a new version of the passage mid-session, the student's
-- active session keeps pointing at the version they started with
-- (surfaced by outside-voice review as a critical data-integrity gap
-- in the original design).
--
-- question_ids is stored as a uuid[] array (not a separate join table)
-- because a session's question set is immutable once created and is
-- always read whole, not joined-against. Array avoids one join per
-- session-load query.

CREATE TYPE session_mode AS ENUM ('practice', 'test');

CREATE TABLE sessions (
  id                   UUID PRIMARY KEY,
  user_id              BIGINT      NOT NULL REFERENCES user_mappings(id) ON DELETE CASCADE,

  mode                 session_mode NOT NULL,
  exam_board           exam_board   NOT NULL,

  passage_id           UUID        NOT NULL,
  passage_version      INTEGER     NOT NULL,

  question_ids         UUID[]      NOT NULL CHECK (array_length(question_ids, 1) BETWEEN 1 AND 20),

  -- NULL in practice mode; positive integer (seconds) in test mode.
  time_allowed_seconds INTEGER     CHECK (time_allowed_seconds IS NULL OR time_allowed_seconds > 0),

  started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at             TIMESTAMPTZ,

  FOREIGN KEY (passage_id, passage_version)
    REFERENCES passages (id, version)
    ON DELETE RESTRICT
);

-- Landing-page query: "what sessions does this user have in progress?"
CREATE INDEX sessions_user_in_progress_idx
  ON sessions (user_id, started_at DESC)
  WHERE ended_at IS NULL;
