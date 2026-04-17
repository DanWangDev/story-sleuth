-- passages: reading-comprehension source material, versioned for
-- immutability once published. Re-ingesting a manifest creates a new
-- version row; the old version is kept so historical student_attempts
-- remain valid.
--
-- Composite PK (id, version) pins attempts to the exact text students
-- answered against.

CREATE TYPE content_status AS ENUM (
  'draft',
  'pending_review',
  'published',
  'archived'
);

CREATE TYPE exam_board AS ENUM ('CEM', 'GL', 'ISEB');
CREATE TYPE genre AS ENUM ('fiction', 'non-fiction');

CREATE TABLE passages (
  id                 UUID        NOT NULL,
  version            INTEGER     NOT NULL CHECK (version > 0),

  title              TEXT        NOT NULL,
  author             TEXT        NOT NULL,
  source             TEXT        NOT NULL,
  source_url         TEXT        NOT NULL,
  year_published     INTEGER     NOT NULL,

  genre              genre       NOT NULL,
  subgenre           TEXT        NOT NULL,

  exam_boards        exam_board[] NOT NULL CHECK (array_length(exam_boards, 1) BETWEEN 1 AND 3),
  difficulty         SMALLINT    NOT NULL CHECK (difficulty BETWEEN 1 AND 3),

  reading_level      TEXT        NOT NULL,
  word_count         INTEGER     NOT NULL CHECK (word_count > 0),

  themes             TEXT[]      NOT NULL DEFAULT '{}',

  body               TEXT        NOT NULL,

  status             content_status NOT NULL DEFAULT 'draft',

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at       TIMESTAMPTZ,

  PRIMARY KEY (id, version)
);

-- Student-facing query: find any published passage for a given exam board.
-- status-filtered to published, exam_boards is a GIN-friendly array.
CREATE INDEX passages_published_status_idx
  ON passages (status)
  WHERE status = 'published';

CREATE INDEX passages_exam_boards_idx
  ON passages USING GIN (exam_boards);
