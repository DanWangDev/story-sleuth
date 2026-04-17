import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createPool } from "../../db/pool.js";
import { resetAndMigrate, seedPublishedContent } from "./fixtures.js";
import { PostgresSessionRepository } from "./postgres-session-repository.js";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = typeof DATABASE_URL === "string" && DATABASE_URL.length > 0;
const d = hasDb ? describe : describe.skip;

d("PostgresSessionRepository", () => {
  let sql: postgres.Sql;
  let repo: PostgresSessionRepository;

  beforeAll(async () => {
    sql = createPool({ connectionString: DATABASE_URL, max: 2 });
    await resetAndMigrate(sql);
    repo = new PostgresSessionRepository(sql);
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("create inserts a practice session with null time_allowed_seconds", async () => {
    const seed = await seedPublishedContent(sql);
    const s = await repo.create({
      user_id: seed.user_id,
      mode: "practice",
      exam_board: "GL",
      passage_id: seed.passage_id,
      passage_version: seed.passage_version,
      question_ids: seed.question_ids,
      time_allowed_seconds: null,
    });
    expect(s.mode).toBe("practice");
    expect(s.time_allowed_seconds).toBeNull();
    expect(s.ended_at).toBeNull();
    expect(s.question_ids).toEqual(seed.question_ids);
    expect(s.passage_version).toBe(seed.passage_version);
  });

  it("create inserts a test session with a positive timer", async () => {
    const seed = await seedPublishedContent(sql);
    const s = await repo.create({
      user_id: seed.user_id,
      mode: "test",
      exam_board: "GL",
      passage_id: seed.passage_id,
      passage_version: seed.passage_version,
      question_ids: seed.question_ids,
      time_allowed_seconds: 2400,
    });
    expect(s.mode).toBe("test");
    expect(s.time_allowed_seconds).toBe(2400);
  });

  it("findById returns the session", async () => {
    const seed = await seedPublishedContent(sql);
    const s = await repo.create({
      user_id: seed.user_id,
      mode: "practice",
      exam_board: "GL",
      passage_id: seed.passage_id,
      passage_version: seed.passage_version,
      question_ids: seed.question_ids,
      time_allowed_seconds: null,
    });
    const found = await repo.findById(s.id);
    expect(found?.id).toBe(s.id);
  });

  it("findInProgressByUser returns only active sessions for that user", async () => {
    const seedA = await seedPublishedContent(sql);
    const seedB = await seedPublishedContent(sql);

    const inProg = await repo.create({
      user_id: seedA.user_id,
      mode: "practice",
      exam_board: "GL",
      passage_id: seedA.passage_id,
      passage_version: seedA.passage_version,
      question_ids: seedA.question_ids,
      time_allowed_seconds: null,
    });
    const ended = await repo.create({
      user_id: seedA.user_id,
      mode: "practice",
      exam_board: "GL",
      passage_id: seedA.passage_id,
      passage_version: seedA.passage_version,
      question_ids: seedA.question_ids,
      time_allowed_seconds: null,
    });
    await repo.markEnded(ended.id);
    // Different user — should be excluded.
    await repo.create({
      user_id: seedB.user_id,
      mode: "practice",
      exam_board: "GL",
      passage_id: seedB.passage_id,
      passage_version: seedB.passage_version,
      question_ids: seedB.question_ids,
      time_allowed_seconds: null,
    });

    const list = await repo.findInProgressByUser(seedA.user_id);
    const ids = list.map((s) => s.id);
    expect(ids).toContain(inProg.id);
    expect(ids).not.toContain(ended.id);
    expect(list.every((s) => s.user_id === seedA.user_id)).toBe(true);
    expect(list.every((s) => s.ended_at === null)).toBe(true);
  });

  it("markEnded is idempotent — re-calling returns the same ended_at", async () => {
    const seed = await seedPublishedContent(sql);
    const s = await repo.create({
      user_id: seed.user_id,
      mode: "practice",
      exam_board: "GL",
      passage_id: seed.passage_id,
      passage_version: seed.passage_version,
      question_ids: seed.question_ids,
      time_allowed_seconds: null,
    });
    const first = await repo.markEnded(s.id);
    const second = await repo.markEnded(s.id);
    expect(first.ended_at).not.toBeNull();
    expect(second.ended_at).toBe(first.ended_at);
  });

  it("markEnded throws for unknown session", async () => {
    await expect(
      repo.markEnded("00000000-0000-4000-8000-000000000000"),
    ).rejects.toThrow(/not found/);
  });
});
