import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createPool } from "./pool.js";
import { runMigrations } from "./migrate.js";

/**
 * Integration tests against a real PostgreSQL. Skipped (not failed) when
 * DATABASE_URL isn't set — CI provides one via a `postgres` service
 * container; local developers set it via .env. Per the design doc, these
 * tests use a REAL Postgres (not a mock) so they exercise actual SQL
 * behaviour, constraints, enums, and index creation.
 *
 * Each test run:
 *   1. Drops and recreates the `public` schema to get a clean slate.
 *   2. Runs the full migration set.
 *   3. Asserts tables, enums, and indexes exist.
 *   4. Runs migrations a second time to confirm idempotence.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = typeof DATABASE_URL === "string" && DATABASE_URL.length > 0;

const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("db migrations (integration)", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = createPool({ connectionString: DATABASE_URL, max: 2 });
    // Clean slate.
    await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await sql.unsafe("CREATE SCHEMA public");
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("runs the full migration set successfully", async () => {
    const result = await runMigrations({ sql, silent: true });
    expect(result.applied).toEqual([
      "001_user_mappings.sql",
      "002_passages.sql",
      "003_questions.sql",
      "004_sessions.sql",
      "005_student_attempts.sql",
      "006_ingest_jobs.sql",
      "007_admin_settings.sql",
    ]);
    expect(result.skipped).toHaveLength(0);
  });

  it("is idempotent — re-running skips every already-applied migration", async () => {
    const result = await runMigrations({ sql, silent: true });
    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(7);
  });

  it("creates every expected table", async () => {
    const expected = [
      "schema_migrations",
      "user_mappings",
      "passages",
      "questions",
      "sessions",
      "student_attempts",
      "ingest_jobs",
      "admin_settings",
    ];
    const rows = await sql<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;
    const names = rows.map((r) => r.tablename).sort();
    for (const t of expected) {
      expect(names).toContain(t);
    }
  });

  it("creates every expected enum type", async () => {
    const expected = [
      "content_status",
      "exam_board",
      "genre",
      "question_type",
      "option_letter",
      "session_mode",
      "ingest_job_status",
    ];
    const rows = await sql<{ typname: string }[]>`
      SELECT typname FROM pg_type WHERE typtype = 'e'
    `;
    const names = rows.map((r) => r.typname);
    for (const t of expected) {
      expect(names).toContain(t);
    }
  });

  it("creates the adaptive-query composite index", async () => {
    const rows = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'student_attempts'
    `;
    const names = rows.map((r) => r.indexname);
    expect(names).toContain("student_attempts_user_type_board_idx");
    expect(names).toContain("student_attempts_session_idx");
    expect(names).toContain("student_attempts_user_question_recent_idx");
  });

  it("passage_version is PK-pinned via (id, version)", async () => {
    const rows = await sql<{ attname: string; position: number }[]>`
      SELECT a.attname AS attname, array_position(i.indkey, a.attnum) AS position
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
      WHERE c.relname = 'passages' AND i.indisprimary
      ORDER BY position
    `;
    expect(rows.map((r) => r.attname)).toEqual(["id", "version"]);
  });

  it("questions enforce options array length = 4 via CHECK constraint", async () => {
    // Create a passage row we can reference. Use unsafe() with explicit
    // casts for the custom-enum array columns — postgres.js's tagged-
    // template array helpers don't know about user-defined enum types.
    const passageId = "11111111-1111-4111-8111-111111111111";
    await sql.unsafe(
      `INSERT INTO passages (
        id, version, title, author, source, source_url, year_published,
        genre, subgenre, exam_boards, difficulty, reading_level,
        word_count, themes, body, status, published_at
      ) VALUES (
        $1, 1, 'T', 'A', 'S', 'https://example.com', 2000,
        'fiction', 'sub',
        '{GL}'::exam_board[], 2, 'Year 5-6',
        100, '{}'::text[], 'body', 'published', NOW()
      )`,
      [passageId],
    );

    const badOptions = JSON.stringify([
      { letter: "A", text: "t", explanation_if_chosen: "e" },
      { letter: "B", text: "t", explanation_if_chosen: "e" },
      { letter: "C", text: "t", explanation_if_chosen: "e" },
    ]);

    await expect(async () => {
      await sql.unsafe(
        `INSERT INTO questions (
          id, passage_id, passage_version, text, question_type,
          exam_boards, difficulty, options, correct_option, status
        ) VALUES (
          '22222222-2222-4222-8222-222222222222',
          $1, 1, 'q?', 'inference',
          '{GL}'::exam_board[], 2,
          $2::jsonb, 'A', 'draft'
        )`,
        [passageId, badOptions],
      );
    }).rejects.toThrow();
  });
});
