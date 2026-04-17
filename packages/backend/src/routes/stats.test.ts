import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { createPool } from "../db/pool.js";
import { createApp } from "../app.js";
import { resetAndMigrate, seedPublishedContent } from "../repositories/postgres/fixtures.js";
import { PostgresStudentAttemptRepository } from "../repositories/postgres/postgres-student-attempt-repository.js";
import { PostgresSessionRepository } from "../repositories/postgres/postgres-session-repository.js";
import type { Env } from "../config/env.js";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = typeof DATABASE_URL === "string" && DATABASE_URL.length > 0;
const d = hasDb ? describe : describe.skip;

const testEnv: Env = {
  NODE_ENV: "test",
  PORT: 5060,
  DATABASE_URL: DATABASE_URL ?? "",
  CORS_ORIGIN: "http://localhost:5180",
  OIDC_ISSUER: "http://localhost:3009",
  OIDC_CLIENT_ID: "story-sleuth-client",
  OIDC_CLIENT_SECRET: "dev-secret",
  OIDC_REDIRECT_URI: "http://localhost:5180/api/auth/callback",
  SESSION_SECRET: "0".repeat(32),
  APP_SLUG: "reading",
  ADMIN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  CONTENT_PATH: "../../content/passages",
};

const testAuthConfig = {
  issuer: testEnv.OIDC_ISSUER,
  clientId: testEnv.OIDC_CLIENT_ID,
  clientSecret: testEnv.OIDC_CLIENT_SECRET,
  redirectUri: testEnv.OIDC_REDIRECT_URI,
  postLogoutRedirectUri: "http://localhost:5180",
  sessionSecret: testEnv.SESSION_SECRET,
};

d("GET /api/stats/:hubUserId (integration)", () => {
  let sql: postgres.Sql;
  let attempts: PostgresStudentAttemptRepository;
  let sessions: PostgresSessionRepository;

  beforeAll(async () => {
    sql = createPool({ connectionString: DATABASE_URL, max: 2 });
    await resetAndMigrate(sql);
    attempts = new PostgresStudentAttemptRepository(sql);
    sessions = new PostgresSessionRepository(sql);
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  function buildApp(hubSub = "hub-service") {
    return createApp({
      env: testEnv,
      sql,
      authConfigOverride: testAuthConfig,
      // Stub service-auth: accept any Bearer, inject these claims.
      hubServiceAuthOverride: (req, res, next) => {
        const header = req.header("authorization");
        if (!header) {
          res.status(401).json({ error: "missing_bearer_token" });
          return;
        }
        if (hubSub !== "hub-service") {
          res.status(403).json({ error: "wrong_token_subject" });
          return;
        }
        req.service_auth = {
          iss: "http://localhost:3009",
          aud: "reading",
          sub: hubSub,
        };
        next();
      },
    });
  }

  beforeEach(async () => {
    // Clean every run so counters are deterministic.
    await sql`TRUNCATE student_attempts, sessions RESTART IDENTITY CASCADE`;
  });

  it("returns empty counters for a hub user that has never opened the app", async () => {
    const res = await request(buildApp())
      .get("/api/stats/hub-user-never-opened")
      .set("Authorization", "Bearer stub-token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      hub_user_id: "hub-user-never-opened",
      app: "reading",
      questions_answered: 0,
      questions_correct: 0,
      overall_accuracy: 0,
      sessions_completed: 0,
      by_exam_board: [],
      by_question_type: [],
      by_difficulty: [],
      last_attempt_at: null,
    });
  });

  it("rejects requests without a service token", async () => {
    const res = await request(buildApp()).get("/api/stats/any-user");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("missing_bearer_token");
  });

  it("rejects requests with the wrong subject", async () => {
    const res = await request(buildApp("student-sub"))
      .get("/api/stats/any-user")
      .set("Authorization", "Bearer stub");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("wrong_token_subject");
  });

  it("aggregates attempts with correct dedup + breakdowns", async () => {
    const hubSub = `hub-stats-user-${Math.random()}`;
    const seed = await seedPublishedContent(sql, { hub_user_id: hubSub });
    expect(seed.question_ids.length).toBeGreaterThanOrEqual(3);

    const session = await sessions.create({
      user_id: seed.user_id,
      mode: "practice",
      exam_board: "GL",
      passage_id: seed.passage_id,
      passage_version: seed.passage_version,
      question_ids: seed.question_ids,
      time_allowed_seconds: null,
    });

    // Retake question 0 twice — second (correct) attempt must override
    // the first (wrong) one in the aggregate.
    await attempts.create({
      session_id: session.id,
      user_id: seed.user_id,
      question_id: seed.question_ids[0]!,
      question_type_tag: "inference",
      exam_board: "GL",
      difficulty: 2,
      selected_letter: "B",
      is_correct: false,
      time_taken_ms: 3000,
    });
    await new Promise((r) => setTimeout(r, 5));
    await attempts.create({
      session_id: session.id,
      user_id: seed.user_id,
      question_id: seed.question_ids[0]!,
      question_type_tag: "inference",
      exam_board: "GL",
      difficulty: 2,
      selected_letter: "C",
      is_correct: true,
      time_taken_ms: 2200,
    });
    // One correct + one wrong on the other two distinct questions.
    await attempts.create({
      session_id: session.id,
      user_id: seed.user_id,
      question_id: seed.question_ids[1]!,
      question_type_tag: "retrieval",
      exam_board: "GL",
      difficulty: 1,
      selected_letter: "A",
      is_correct: true,
      time_taken_ms: 1500,
    });
    await attempts.create({
      session_id: session.id,
      user_id: seed.user_id,
      question_id: seed.question_ids[2]!,
      question_type_tag: "vocabulary-in-context",
      exam_board: "GL",
      difficulty: 3,
      selected_letter: "D",
      is_correct: false,
      time_taken_ms: 4000,
    });

    // Mark the session completed so sessions_completed === 1.
    await sessions.markEnded(session.id);

    const res = await request(buildApp())
      .get(`/api/stats/${encodeURIComponent(hubSub)}`)
      .set("Authorization", "Bearer stub");

    expect(res.status).toBe(200);
    expect(res.body.hub_user_id).toBe(hubSub);
    expect(res.body.app).toBe("reading");

    // 3 distinct questions answered; question 0's most-recent attempt
    // is correct, question 1 correct, question 2 wrong → 2/3 right.
    expect(res.body.questions_answered).toBe(3);
    expect(res.body.questions_correct).toBe(2);
    expect(res.body.overall_accuracy).toBeCloseTo(2 / 3);
    expect(res.body.sessions_completed).toBe(1);
    expect(typeof res.body.last_attempt_at).toBe("string");

    // Exam-board breakdown: everything is GL here.
    expect(res.body.by_exam_board).toEqual([
      {
        exam_board: "GL",
        total_attempts: 3,
        correct_count: 2,
        accuracy: expect.closeTo(2 / 3, 5),
      },
    ]);

    // Question-type breakdown: one row per type, deduped.
    const typeTotals = Object.fromEntries(
      (
        res.body.by_question_type as Array<{
          question_type_tag: string;
          total_attempts: number;
          correct_count: number;
        }>
      ).map((r) => [
        r.question_type_tag,
        { total: r.total_attempts, correct: r.correct_count },
      ]),
    );
    expect(typeTotals.inference).toEqual({ total: 1, correct: 1 });
    expect(typeTotals.retrieval).toEqual({ total: 1, correct: 1 });
    expect(typeTotals["vocabulary-in-context"]).toEqual({
      total: 1,
      correct: 0,
    });

    // Difficulty breakdown: one row per difficulty present.
    const diffTotals = Object.fromEntries(
      (
        res.body.by_difficulty as Array<{
          difficulty: number;
          total_attempts: number;
          correct_count: number;
        }>
      ).map((r) => [r.difficulty, { total: r.total_attempts, correct: r.correct_count }]),
    );
    expect(diffTotals[1]).toEqual({ total: 1, correct: 1 });
    expect(diffTotals[2]).toEqual({ total: 1, correct: 1 });
    expect(diffTotals[3]).toEqual({ total: 1, correct: 0 });
  });
});
