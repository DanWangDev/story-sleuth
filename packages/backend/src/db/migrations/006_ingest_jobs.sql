-- ingest_jobs: one row per admin-triggered content pipeline run.
--
-- The endpoint contract (POST /admin/ingest/:passage_manifest_id →
-- 202 + { job_id }; GET /admin/ingest/:job_id for status) is async-
-- ready from day one even though Phase 1 runs work synchronously
-- inline. This row is the job's durable state — Phase 2 can swap in
-- BullMQ without breaking admin clients.

CREATE TYPE ingest_job_status AS ENUM (
  'pending',
  'running',
  'completed',
  'failed'
);

CREATE TABLE ingest_jobs (
  id                       UUID PRIMARY KEY,

  passage_manifest_id      INTEGER          NOT NULL,
  triggered_by_user_id     BIGINT           NOT NULL REFERENCES user_mappings(id) ON DELETE RESTRICT,

  status                   ingest_job_status NOT NULL DEFAULT 'pending',

  questions_generated      INTEGER          NOT NULL DEFAULT 0 CHECK (questions_generated >= 0),
  questions_failed         INTEGER          NOT NULL DEFAULT 0 CHECK (questions_failed >= 0),

  started_at               TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  completed_at             TIMESTAMPTZ,

  error_log                TEXT
);

-- Admin "ingest jobs" page: recent runs, newest first.
CREATE INDEX ingest_jobs_started_at_idx
  ON ingest_jobs (started_at DESC);
