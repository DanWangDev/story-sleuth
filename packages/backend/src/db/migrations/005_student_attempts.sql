-- student_attempts: append-only history, one row per answer submission.
--
-- Never updated. If the same student re-takes the same question in a
-- future session, a new row is inserted. Stats queries dedupe via
-- window function (DISTINCT ON most recent per (user_id, question_id)),
-- not by mutating history. This preserves the full learning trajectory
-- for the adaptive engine (Phase 2).
--
-- question_type_tag, exam_board, and difficulty are DENORMALISED from
-- the questions row. This is deliberate: the Phase 2 adaptive query
-- aggregates over millions of rows and cannot afford a join per row.
-- Since questions are immutable-once-published, the denormalised
-- copies cannot drift from source of truth.

CREATE TABLE student_attempts (
  id                  UUID PRIMARY KEY,
  session_id          UUID          NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id             BIGINT        NOT NULL REFERENCES user_mappings(id) ON DELETE CASCADE,
  question_id         UUID          NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,

  -- Denormalised from questions for fast aggregates.
  question_type_tag   question_type NOT NULL,
  exam_board          exam_board    NOT NULL,
  difficulty          SMALLINT      NOT NULL CHECK (difficulty BETWEEN 1 AND 3),

  selected_letter     option_letter NOT NULL,
  is_correct          BOOLEAN       NOT NULL,

  time_taken_ms       INTEGER       NOT NULL CHECK (time_taken_ms >= 0),

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Phase 2 adaptive query driver: accuracy-per-type for a given student,
-- optionally scoped by exam board.
CREATE INDEX student_attempts_user_type_board_idx
  ON student_attempts (user_id, question_type_tag, exam_board);

-- Per-session lookup: results page loads all attempts for a session.
CREATE INDEX student_attempts_session_idx
  ON student_attempts (session_id);

-- Dedup-most-recent-per-question query support.
CREATE INDEX student_attempts_user_question_recent_idx
  ON student_attempts (user_id, question_id, created_at DESC);
