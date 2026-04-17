import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { createPool } from "../db/pool.js";
import { SecretCrypto } from "../crypto/secret-crypto.js";
import {
  resetAndMigrate,
  seedPublishedContent,
} from "../repositories/postgres/fixtures.js";
import { PostgresAdminSettingsRepository } from "../repositories/postgres/postgres-admin-settings-repository.js";
import { PostgresPassageRepository } from "../repositories/postgres/postgres-passage-repository.js";
import { PostgresQuestionRepository } from "../repositories/postgres/postgres-question-repository.js";
import { PostgresSessionRepository } from "../repositories/postgres/postgres-session-repository.js";
import { PostgresStudentAttemptRepository } from "../repositories/postgres/postgres-student-attempt-repository.js";
import { LLMFactory, LLM_SETTING_KEYS } from "../llm/factory.js";
import { LLMError, type ILLMClient } from "../llm/types.js";
import { CoachError, CoachService } from "./coach-service.js";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = typeof DATABASE_URL === "string" && DATABASE_URL.length > 0;
const d = hasDb ? describe : describe.skip;

d("CoachService", () => {
  let sql: postgres.Sql;
  let passages: PostgresPassageRepository;
  let questions: PostgresQuestionRepository;
  let sessions: PostgresSessionRepository;
  let attempts: PostgresStudentAttemptRepository;
  let factory: LLMFactory;
  let settings: PostgresAdminSettingsRepository;
  let service: CoachService;
  let fakeGenerate: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    sql = createPool({ connectionString: DATABASE_URL, max: 2 });
    await resetAndMigrate(sql);
    passages = new PostgresPassageRepository(sql);
    questions = new PostgresQuestionRepository(sql);
    sessions = new PostgresSessionRepository(sql);
    attempts = new PostgresStudentAttemptRepository(sql);

    const crypto = new SecretCrypto(randomBytes(32));
    settings = new PostgresAdminSettingsRepository(sql, crypto);
    factory = new LLMFactory(settings);

    // Stub the factory so we never hit a real LLM. Per-test can replace
    // this to force error paths.
    fakeGenerate = vi.fn();
    vi.spyOn(factory, "buildClient").mockImplementation(async () => {
      return {
        provider: "qwen",
        model: "qwen-plus",
        generate: fakeGenerate,
      } satisfies ILLMClient;
    });

    service = new CoachService(sessions, attempts, questions, passages, factory);
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  beforeEach(() => {
    fakeGenerate.mockReset();
  });

  async function setupEndedSessionWithAttempt(): Promise<{
    user_id: number;
    session_id: string;
    attempt_id: string;
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
    // Record a WRONG answer (seeded questions have correct_option="B";
    // fixtures use option "B" as correct).
    const attempt = await attempts.create({
      session_id: session.id,
      user_id: seed.user_id,
      question_id: seed.question_ids[0]!,
      question_type_tag: "inference",
      exam_board: "GL",
      difficulty: 2,
      selected_letter: "A",
      is_correct: false,
      time_taken_ms: 2000,
    });
    await sessions.markEnded(session.id);
    return {
      user_id: seed.user_id,
      session_id: session.id,
      attempt_id: attempt.id,
    };
  }

  it("returns a walk-through for an ended session's wrong attempt", async () => {
    fakeGenerate.mockResolvedValue({
      text: "Let's look at the clue in the second paragraph...\n",
      model: "qwen-plus",
      input_tokens: 400,
      output_tokens: 180,
    });
    const ctx = await setupEndedSessionWithAttempt();

    const out = await service.generateWalkthrough({
      session_id: ctx.session_id,
      attempt_id: ctx.attempt_id,
      user_id: ctx.user_id,
    });
    expect(out.provider).toBe("qwen");
    expect(out.model).toBe("qwen-plus");
    expect(out.text).toBe("Let's look at the clue in the second paragraph...");
    expect(fakeGenerate).toHaveBeenCalledOnce();
  });

  it("builds a prompt that includes the passage + question + student's answer", async () => {
    fakeGenerate.mockResolvedValue({
      text: "x",
      model: "qwen-plus",
    });
    const ctx = await setupEndedSessionWithAttempt();
    await service.generateWalkthrough({
      session_id: ctx.session_id,
      attempt_id: ctx.attempt_id,
      user_id: ctx.user_id,
    });
    const call = fakeGenerate.mock.calls[0]![0] as {
      system: string;
      user: string;
    };
    expect(call.system).toMatch(/10-11 year old/i);
    expect(call.user).toMatch(/Passage:/);
    expect(call.user).toMatch(/The student chose A/);
    expect(call.user).toMatch(/correct answer was B/);
  });

  it("404 when the session doesn't exist", async () => {
    await expect(
      service.generateWalkthrough({
        session_id: "00000000-0000-4000-8000-000000000000",
        attempt_id: "00000000-0000-4000-8000-000000000001",
        user_id: 1,
      }),
    ).rejects.toMatchObject({
      name: "CoachError",
      code: "session_not_found",
      http_status: 404,
    });
  });

  it("403 when the session belongs to someone else", async () => {
    const ctx = await setupEndedSessionWithAttempt();
    await expect(
      service.generateWalkthrough({
        session_id: ctx.session_id,
        attempt_id: ctx.attempt_id,
        user_id: ctx.user_id + 999,
      }),
    ).rejects.toMatchObject({ code: "session_forbidden" });
  });

  it("409 when the session is still active", async () => {
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
    const attempt = await attempts.create({
      session_id: session.id,
      user_id: seed.user_id,
      question_id: seed.question_ids[0]!,
      question_type_tag: "inference",
      exam_board: "GL",
      difficulty: 2,
      selected_letter: "A",
      is_correct: false,
      time_taken_ms: 1000,
    });

    await expect(
      service.generateWalkthrough({
        session_id: session.id,
        attempt_id: attempt.id,
        user_id: seed.user_id,
      }),
    ).rejects.toMatchObject({
      code: "session_not_ended",
      http_status: 409,
    });
  });

  it("404 when the attempt id isn't in the session", async () => {
    const ctx = await setupEndedSessionWithAttempt();
    await expect(
      service.generateWalkthrough({
        session_id: ctx.session_id,
        attempt_id: "00000000-0000-4000-8000-999999999999",
        user_id: ctx.user_id,
      }),
    ).rejects.toMatchObject({ code: "attempt_not_in_session" });
  });

  it("503 when the LLM isn't configured", async () => {
    // Temporarily unstub buildClient so it surfaces the real factory's
    // provider_unknown error.
    const spy = vi.spyOn(factory, "buildClient");
    spy.mockRestore();
    try {
      for (const p of ["qwen", "openai", "anthropic"] as const) {
        await settings.delete(LLM_SETTING_KEYS.api_key(p));
      }
      await settings.delete(LLM_SETTING_KEYS.active_provider);

      const ctx = await setupEndedSessionWithAttempt();
      await expect(
        service.generateWalkthrough({
          session_id: ctx.session_id,
          attempt_id: ctx.attempt_id,
          user_id: ctx.user_id,
        }),
      ).rejects.toMatchObject({
        code: "llm_unavailable",
        http_status: 503,
      });
    } finally {
      // Re-stub for other tests in this file.
      vi.spyOn(factory, "buildClient").mockImplementation(async () => ({
        provider: "qwen",
        model: "qwen-plus",
        generate: fakeGenerate,
      }));
    }
  });

  it("504 when the LLM call times out (retryable LLMError)", async () => {
    fakeGenerate.mockRejectedValue(
      new LLMError("slow", "timeout", "qwen", true),
    );
    const ctx = await setupEndedSessionWithAttempt();
    await expect(
      service.generateWalkthrough({
        session_id: ctx.session_id,
        attempt_id: ctx.attempt_id,
        user_id: ctx.user_id,
      }),
    ).rejects.toMatchObject({ code: "llm_error", http_status: 504 });
  });

  it("502 when the LLM call fails with a non-retryable error", async () => {
    fakeGenerate.mockRejectedValue(
      new LLMError("bad key", "invalid_api_key", "qwen", false),
    );
    const ctx = await setupEndedSessionWithAttempt();
    await expect(
      service.generateWalkthrough({
        session_id: ctx.session_id,
        attempt_id: ctx.attempt_id,
        user_id: ctx.user_id,
      }),
    ).rejects.toMatchObject({ code: "llm_error", http_status: 502 });
  });
});
