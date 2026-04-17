import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express, {
  type Express,
  type RequestHandler,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import postgres from "postgres";
import { createPool } from "../db/pool.js";
import {
  passageCreateInput,
  questionCreateInput,
  resetAndMigrate,
} from "../repositories/postgres/fixtures.js";
import { PostgresPassageRepository } from "../repositories/postgres/postgres-passage-repository.js";
import { PostgresQuestionRepository } from "../repositories/postgres/postgres-question-repository.js";
import { PostgresSessionRepository } from "../repositories/postgres/postgres-session-repository.js";
import { PostgresStudentAttemptRepository } from "../repositories/postgres/postgres-student-attempt-repository.js";
import { PostgresUserMappingRepository } from "../repositories/postgres/postgres-user-mapping-repository.js";
import { SessionService } from "../services/session-service.js";
import { createSessionsRouter } from "./sessions.js";
import type { AuthContext } from "../auth/middleware.js";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = typeof DATABASE_URL === "string" && DATABASE_URL.length > 0;
const d = hasDb ? describe : describe.skip;

/**
 * Test-only auth: reads `X-Test-User-Id` header and injects req.auth.
 * The real middleware stays untested here (covered in middleware.test.ts);
 * these tests focus on the router + service behaviour. Using header-
 * based auth in tests is safer than reusing production auth which would
 * need a live hub for OIDC discovery.
 */
function testAuth(): RequestHandler {
  return (req, res, next) => {
    const header = req.headers["x-test-user-id"];
    if (typeof header !== "string") {
      res.status(401).json({ error: "no test user" });
      return;
    }
    const user_id = Number(header);
    if (!Number.isFinite(user_id)) {
      res.status(401).json({ error: "bad test user id" });
      return;
    }
    const ctx: AuthContext = {
      user_id,
      claims: {
        sub: `test-sub-${user_id}`,
        role: "student",
        apps: ["reading"],
      } as AuthContext["claims"],
    };
    (req as Request & { auth?: AuthContext }).auth = ctx;
    next();
  };
}

d("Sessions router (HTTP integration)", () => {
  let sql: postgres.Sql;
  let app: Express;
  let svc: SessionService;
  let users: PostgresUserMappingRepository;
  let passages: PostgresPassageRepository;
  let questions: PostgresQuestionRepository;

  beforeAll(async () => {
    sql = createPool({ connectionString: DATABASE_URL, max: 3 });
    await resetAndMigrate(sql);
    users = new PostgresUserMappingRepository(sql);
    passages = new PostgresPassageRepository(sql);
    questions = new PostgresQuestionRepository(sql);
    const sessionRepo = new PostgresSessionRepository(sql);
    const attempts = new PostgresStudentAttemptRepository(sql);
    svc = new SessionService(passages, questions, sessionRepo, attempts);

    app = express();
    app.use(express.json());
    app.use(
      "/api/sessions",
      testAuth(),
      createSessionsRouter(svc),
    );
    app.use(
      (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
        res.status(500).json({ error: err.message });
      },
    );
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  let userA: { id: number };
  let userB: { id: number };
  let passageId: string;
  let publishedQuestionIds: string[];

  async function seedContent(): Promise<void> {
    const passage = await passages.create(
      passageCreateInput({ status: "published", exam_boards: ["GL"] }),
    );
    const qs = await questions.createMany(
      Array.from({ length: 4 }, (_, i) =>
        questionCreateInput(passage.id, passage.version, {
          text: `Q${i + 1}`,
          exam_boards: ["GL"],
          status: "published",
          correct_option: "B",
        }),
      ),
    );
    passageId = passage.id;
    publishedQuestionIds = qs.map((q) => q.id);
  }

  /**
   * Reset + re-migrate ONCE in beforeAll, not per test — postgres.js
   * caches custom-type OIDs on its connections and DROP SCHEMA
   * invalidates them, surfacing as "cache lookup failed for type NNNN"
   * on the next query. Each `it` isolates via unique user subs + fresh
   * passage/question rows; rows from earlier tests don't interfere
   * because every query scopes to those unique ids.
   */
  beforeEach(async () => {
    userA = await users.getOrCreate(`alpha-${Math.random()}`);
    userB = await users.getOrCreate(`beta-${Math.random()}`);
    await seedContent();
  });

  describe("POST /api/sessions", () => {
    it("401 without auth", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .send({ mode: "practice", exam_board: "GL" });
      expect(res.status).toBe(401);
    });

    it("400 on invalid body (missing mode)", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .set("x-test-user-id", String(userA.id))
        .send({ exam_board: "GL" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_request");
    });

    it("404 when no content for exam board", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .set("x-test-user-id", String(userA.id))
        .send({ mode: "practice", exam_board: "ISEB" });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("no_content_for_exam_board");
    });

    it("201 creates a practice session, returns redacted questions", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .set("x-test-user-id", String(userA.id))
        .send({ mode: "practice", exam_board: "GL", passage_id: passageId });
      expect(res.status).toBe(201);
      expect(res.body.active).toBe(true);
      expect(res.body.session.mode).toBe("practice");
      expect(res.body.session.time_allowed_seconds).toBeNull();
      expect(res.body.passage.id).toBe(passageId);
      expect(res.body.questions).toHaveLength(4);
      for (const q of res.body.questions) {
        // Redaction: no correct_option, no per-option explanations.
        expect(q).not.toHaveProperty("correct_option");
        for (const o of q.options) {
          expect(o).not.toHaveProperty("explanation_if_chosen");
        }
      }
    });

    it("201 creates a test session with default timer", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .set("x-test-user-id", String(userA.id))
        .send({ mode: "test", exam_board: "GL" });
      expect(res.status).toBe(201);
      expect(res.body.session.mode).toBe("test");
      expect(res.body.session.time_allowed_seconds).toBe(2400);
    });

    it("201 creates a test session with custom timer", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .set("x-test-user-id", String(userA.id))
        .send({
          mode: "test",
          exam_board: "GL",
          time_allowed_seconds: 600,
        });
      expect(res.status).toBe(201);
      expect(res.body.session.time_allowed_seconds).toBe(600);
    });

    it("404 when passage_id doesn't exist", async () => {
      const res = await request(app)
        .post("/api/sessions")
        .set("x-test-user-id", String(userA.id))
        .send({
          mode: "practice",
          exam_board: "GL",
          passage_id: "00000000-0000-4000-8000-000000000000",
        });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("passage_not_found");
    });
  });

  describe("GET /api/sessions/:id", () => {
    let sessionId: string;

    beforeEach(async () => {
      const created = await request(app)
        .post("/api/sessions")
        .set("x-test-user-id", String(userA.id))
        .send({ mode: "practice", exam_board: "GL", passage_id: passageId });
      sessionId = created.body.session.id;
    });

    it("200 loads own in-progress session with redacted questions", async () => {
      const res = await request(app)
        .get(`/api/sessions/${sessionId}`)
        .set("x-test-user-id", String(userA.id));
      expect(res.status).toBe(200);
      expect(res.body.active).toBe(true);
      for (const q of res.body.questions) {
        expect(q).not.toHaveProperty("correct_option");
      }
    });

    it("403 when another user tries to load", async () => {
      const res = await request(app)
        .get(`/api/sessions/${sessionId}`)
        .set("x-test-user-id", String(userB.id));
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("session_forbidden");
    });

    it("404 for unknown session id", async () => {
      const res = await request(app)
        .get("/api/sessions/00000000-0000-4000-8000-000000000000")
        .set("x-test-user-id", String(userA.id));
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("session_not_found");
    });
  });

  describe("POST /api/sessions/:id/answers", () => {
    let sessionId: string;

    beforeEach(async () => {
      const created = await request(app)
        .post("/api/sessions")
        .set("x-test-user-id", String(userA.id))
        .send({ mode: "practice", exam_board: "GL", passage_id: passageId });
      sessionId = created.body.session.id;
    });

    it("200 records an attempt but hides is_correct (batched feedback)", async () => {
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/answers`)
        .set("x-test-user-id", String(userA.id))
        .send({
          question_id: publishedQuestionIds[0],
          selected_letter: "A",
          time_taken_ms: 1000,
        });
      expect(res.status).toBe(200);
      expect(res.body.accepted).toBe(true);
      expect(res.body).not.toHaveProperty("is_correct");
    });

    it("409 on duplicate answer for the same question in the same session", async () => {
      const body = {
        question_id: publishedQuestionIds[0],
        selected_letter: "A" as const,
        time_taken_ms: 500,
      };
      await request(app)
        .post(`/api/sessions/${sessionId}/answers`)
        .set("x-test-user-id", String(userA.id))
        .send(body);
      const dup = await request(app)
        .post(`/api/sessions/${sessionId}/answers`)
        .set("x-test-user-id", String(userA.id))
        .send(body);
      expect(dup.status).toBe(409);
      expect(dup.body.error).toBe("duplicate_answer");
    });

    it("400 when question_id is not part of this session", async () => {
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/answers`)
        .set("x-test-user-id", String(userA.id))
        .send({
          question_id: "00000000-0000-4000-8000-000000000000",
          selected_letter: "A",
          time_taken_ms: 0,
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("question_not_in_session");
    });

    it("403 when a different user tries to submit", async () => {
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/answers`)
        .set("x-test-user-id", String(userB.id))
        .send({
          question_id: publishedQuestionIds[0],
          selected_letter: "A",
          time_taken_ms: 0,
        });
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/sessions/:id/end", () => {
    let sessionId: string;

    beforeEach(async () => {
      const created = await request(app)
        .post("/api/sessions")
        .set("x-test-user-id", String(userA.id))
        .send({ mode: "practice", exam_board: "GL", passage_id: passageId });
      sessionId = created.body.session.id;
    });

    it("returns full results with per-option explanations + summary", async () => {
      // Answer 2 correct, 1 wrong, skip 1. correct_option is 'B' on all seeded q.
      await request(app)
        .post(`/api/sessions/${sessionId}/answers`)
        .set("x-test-user-id", String(userA.id))
        .send({ question_id: publishedQuestionIds[0], selected_letter: "B", time_taken_ms: 100 });
      await request(app)
        .post(`/api/sessions/${sessionId}/answers`)
        .set("x-test-user-id", String(userA.id))
        .send({ question_id: publishedQuestionIds[1], selected_letter: "B", time_taken_ms: 100 });
      await request(app)
        .post(`/api/sessions/${sessionId}/answers`)
        .set("x-test-user-id", String(userA.id))
        .send({ question_id: publishedQuestionIds[2], selected_letter: "A", time_taken_ms: 100 });

      const res = await request(app)
        .post(`/api/sessions/${sessionId}/end`)
        .set("x-test-user-id", String(userA.id));
      expect(res.status).toBe(200);
      expect(res.body.session.ended_at).not.toBeNull();
      expect(res.body.questions).toHaveLength(4);
      // Full resolution: correct_option + explanations are present.
      for (const q of res.body.questions) {
        expect(q.correct_option).toBe("B");
        for (const o of q.options) {
          expect(typeof o.explanation_if_chosen).toBe("string");
        }
      }
      expect(res.body.summary.total).toBe(3);
      expect(res.body.summary.correct).toBe(2);
      expect(res.body.summary.accuracy).toBeCloseTo(2 / 3, 5);
      expect(res.body.summary.unanswered_question_ids).toHaveLength(1);
      expect(res.body.summary.unanswered_question_ids[0]).toBe(
        publishedQuestionIds[3],
      );
      expect(res.body.summary.per_type_breakdown.length).toBeGreaterThan(0);
    });

    it("is idempotent — re-ending a session returns the same ended_at", async () => {
      const first = await request(app)
        .post(`/api/sessions/${sessionId}/end`)
        .set("x-test-user-id", String(userA.id));
      const second = await request(app)
        .post(`/api/sessions/${sessionId}/end`)
        .set("x-test-user-id", String(userA.id));
      expect(second.status).toBe(200);
      expect(second.body.session.ended_at).toBe(first.body.session.ended_at);
    });

    it("409 when submitting an answer after session ended", async () => {
      await request(app)
        .post(`/api/sessions/${sessionId}/end`)
        .set("x-test-user-id", String(userA.id));
      const late = await request(app)
        .post(`/api/sessions/${sessionId}/answers`)
        .set("x-test-user-id", String(userA.id))
        .send({
          question_id: publishedQuestionIds[0],
          selected_letter: "A",
          time_taken_ms: 100,
        });
      expect(late.status).toBe(409);
      expect(late.body.error).toBe("session_ended");
    });
  });

  describe("GET /api/sessions/in-progress", () => {
    it("returns only the authenticated user's active sessions", async () => {
      // userA starts two sessions, ends one. userB starts one.
      const s1 = await request(app)
        .post("/api/sessions")
        .set("x-test-user-id", String(userA.id))
        .send({ mode: "practice", exam_board: "GL" });
      const s2 = await request(app)
        .post("/api/sessions")
        .set("x-test-user-id", String(userA.id))
        .send({ mode: "practice", exam_board: "GL" });
      await request(app)
        .post(`/api/sessions/${s1.body.session.id}/end`)
        .set("x-test-user-id", String(userA.id));
      await request(app)
        .post("/api/sessions")
        .set("x-test-user-id", String(userB.id))
        .send({ mode: "practice", exam_board: "GL" });

      const res = await request(app)
        .get("/api/sessions/in-progress")
        .set("x-test-user-id", String(userA.id));
      expect(res.status).toBe(200);
      const ids = res.body.sessions.map((s: { id: string }) => s.id);
      expect(ids).toContain(s2.body.session.id);
      expect(ids).not.toContain(s1.body.session.id);
      for (const s of res.body.sessions) {
        expect(s.user_id).toBe(userA.id);
        expect(s.ended_at).toBeNull();
      }
    });
  });
});
