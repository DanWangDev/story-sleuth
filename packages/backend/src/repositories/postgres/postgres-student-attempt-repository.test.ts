import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createPool } from "../../db/pool.js";
import { resetAndMigrate, seedPublishedContent } from "./fixtures.js";
import { PostgresSessionRepository } from "./postgres-session-repository.js";
import { PostgresStudentAttemptRepository } from "./postgres-student-attempt-repository.js";
import type { StudentAttemptCreateInput } from "../interfaces/student-attempt-repository.js";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = typeof DATABASE_URL === "string" && DATABASE_URL.length > 0;
const d = hasDb ? describe : describe.skip;

d("PostgresStudentAttemptRepository", () => {
  let sql: postgres.Sql;
  let sessions: PostgresSessionRepository;
  let repo: PostgresStudentAttemptRepository;

  beforeAll(async () => {
    sql = createPool({ connectionString: DATABASE_URL, max: 2 });
    await resetAndMigrate(sql);
    sessions = new PostgresSessionRepository(sql);
    repo = new PostgresStudentAttemptRepository(sql);
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  async function setupSession(): Promise<{
    user_id: number;
    session_id: string;
    question_ids: string[];
  }> {
    const seed = await seedPublishedContent(sql);
    const session = await sessions.create({
      user_id: seed.user_id,
      mode: "practice",
      exam_board: "GL",
      passage_id: seed.passage_id,
      passage_version: seed.passage_version,
      question_ids: seed.question_ids,
      time_allowed_seconds: null,
    });
    return {
      user_id: seed.user_id,
      session_id: session.id,
      question_ids: seed.question_ids,
    };
  }

  function baseInput(
    overrides: Partial<StudentAttemptCreateInput>,
  ): StudentAttemptCreateInput {
    return {
      session_id: "00000000-0000-4000-8000-000000000000",
      user_id: 1,
      question_id: "00000000-0000-4000-8000-000000000000",
      question_type_tag: "inference",
      exam_board: "GL",
      difficulty: 2,
      selected_letter: "B",
      is_correct: false,
      time_taken_ms: 1000,
      ...overrides,
    };
  }

  it("create inserts an attempt and returns the row", async () => {
    const ctx = await setupSession();
    const a = await repo.create(
      baseInput({
        session_id: ctx.session_id,
        user_id: ctx.user_id,
        question_id: ctx.question_ids[0]!,
        is_correct: true,
      }),
    );
    expect(a.is_correct).toBe(true);
    expect(a.session_id).toBe(ctx.session_id);
    expect(typeof a.created_at).toBe("string");
  });

  it("findBySession returns attempts in insertion order", async () => {
    const ctx = await setupSession();
    for (const qid of ctx.question_ids.slice(0, 3)) {
      await repo.create(
        baseInput({
          session_id: ctx.session_id,
          user_id: ctx.user_id,
          question_id: qid,
        }),
      );
      await new Promise((r) => setTimeout(r, 2));
    }
    const list = await repo.findBySession(ctx.session_id);
    expect(list).toHaveLength(3);
    expect(list[0]!.question_id).toBe(ctx.question_ids[0]);
    expect(list[2]!.question_id).toBe(ctx.question_ids[2]);
  });

  it("getTypeAccuracyForUser dedupes retakes to the most recent attempt", async () => {
    const ctx = await setupSession();
    const qid = ctx.question_ids[0]!;

    // First attempt: wrong.
    await repo.create(
      baseInput({
        session_id: ctx.session_id,
        user_id: ctx.user_id,
        question_id: qid,
        question_type_tag: "retrieval",
        is_correct: false,
      }),
    );
    await new Promise((r) => setTimeout(r, 5));
    // Retake on another session: correct. Must override in stats.
    const ctx2 = await setupSession();
    // Use same user for retake (not ctx2.user_id which is different).
    await repo.create(
      baseInput({
        session_id: ctx2.session_id,
        user_id: ctx.user_id,
        question_id: qid,
        question_type_tag: "retrieval",
        is_correct: true,
      }),
    );

    const stats = await repo.getTypeAccuracyForUser(ctx.user_id);
    const retrieval = stats.find((s) => s.question_type_tag === "retrieval");
    expect(retrieval).toBeDefined();
    expect(retrieval!.total_attempts).toBe(1);
    expect(retrieval!.correct_count).toBe(1);
    expect(retrieval!.accuracy).toBe(1);
  });

  it("getTypeAccuracyForUser aggregates across question types", async () => {
    const ctx = await setupSession();
    await repo.create(
      baseInput({
        session_id: ctx.session_id,
        user_id: ctx.user_id,
        question_id: ctx.question_ids[0]!,
        question_type_tag: "inference",
        is_correct: true,
      }),
    );
    await repo.create(
      baseInput({
        session_id: ctx.session_id,
        user_id: ctx.user_id,
        question_id: ctx.question_ids[1]!,
        question_type_tag: "inference",
        is_correct: false,
      }),
    );
    await repo.create(
      baseInput({
        session_id: ctx.session_id,
        user_id: ctx.user_id,
        question_id: ctx.question_ids[2]!,
        question_type_tag: "vocabulary-in-context",
        is_correct: true,
      }),
    );

    const stats = await repo.getTypeAccuracyForUser(ctx.user_id);
    const byType = new Map(stats.map((s) => [s.question_type_tag, s]));

    expect(byType.get("inference")?.total_attempts).toBeGreaterThanOrEqual(2);
    expect(byType.get("inference")?.correct_count).toBeGreaterThanOrEqual(1);
    expect(byType.get("vocabulary-in-context")?.total_attempts).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("getTypeAccuracyForUser scopes by exam_board when provided", async () => {
    const ctx = await setupSession();
    await repo.create(
      baseInput({
        session_id: ctx.session_id,
        user_id: ctx.user_id,
        question_id: ctx.question_ids[0]!,
        question_type_tag: "figurative-language",
        exam_board: "GL",
        is_correct: true,
      }),
    );
    const gl = await repo.getTypeAccuracyForUser(ctx.user_id, "GL");
    const cem = await repo.getTypeAccuracyForUser(ctx.user_id, "CEM");
    expect(gl.some((s) => s.question_type_tag === "figurative-language")).toBe(
      true,
    );
    expect(cem.some((s) => s.question_type_tag === "figurative-language")).toBe(
      false,
    );
  });

  it("getTypeAccuracyForUser returns [] when user has no attempts", async () => {
    expect(await repo.getTypeAccuracyForUser(999999)).toEqual([]);
  });
});
