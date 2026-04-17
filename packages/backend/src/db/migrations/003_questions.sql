-- questions: multiple-choice comprehension questions tied to a specific
-- passage version.
--
-- Key eng-review decision (outside-voice fix): exam_boards is a
-- FIRST-CLASS field on the question, not derived from the passage. CEM /
-- GL / ISEB have structurally different question formats; a student
-- sitting GL must see only GL-styled questions about a shared passage.
--
-- Per-option explanations are stored inline as JSONB (Phase 1 = 4 options
-- per question). This implements the two-tier coaching design: all four
-- explanations are pre-generated, so per-wrong-answer feedback on the
-- results page is instant and free to serve. Live LLM is only hit on the
-- opt-in "walk-through" button.

CREATE TYPE question_type AS ENUM (
  'retrieval',
  'inference',
  'vocabulary-in-context',
  'authors-intent',
  'figurative-language',
  'structure-and-organization'
);

CREATE TYPE option_letter AS ENUM ('A', 'B', 'C', 'D');

CREATE TABLE questions (
  id                UUID PRIMARY KEY,

  passage_id        UUID    NOT NULL,
  passage_version   INTEGER NOT NULL,

  text              TEXT          NOT NULL,
  question_type     question_type NOT NULL,
  exam_boards       exam_board[]  NOT NULL CHECK (array_length(exam_boards, 1) BETWEEN 1 AND 3),
  difficulty        SMALLINT      NOT NULL CHECK (difficulty BETWEEN 1 AND 3),

  -- JSONB shape per option:
  -- { "letter": "A", "text": "...", "explanation_if_chosen": "..." }
  -- Exactly 4 elements enforced at the Zod layer and by a CHECK here.
  options           JSONB        NOT NULL,

  correct_option    option_letter NOT NULL,

  status            content_status NOT NULL DEFAULT 'draft',

  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  published_at      TIMESTAMPTZ,

  CONSTRAINT questions_options_is_array
    CHECK (jsonb_typeof(options) = 'array'),
  CONSTRAINT questions_options_length_4
    CHECK (jsonb_array_length(options) = 4),

  FOREIGN KEY (passage_id, passage_version)
    REFERENCES passages (id, version)
    ON DELETE RESTRICT
);

-- Session-creation query: find published questions for a given published
-- passage version, optionally filtered to an exam board.
CREATE INDEX questions_passage_status_idx
  ON questions (passage_id, passage_version, status);

CREATE INDEX questions_exam_boards_idx
  ON questions USING GIN (exam_boards);

-- Admin review queue: find questions currently pending review.
CREATE INDEX questions_pending_review_idx
  ON questions (created_at)
  WHERE status = 'pending_review';
