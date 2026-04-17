import { describe, it, expect } from "vitest";
import { SessionSchema } from "./session.js";

const validSession = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: 42,
  mode: "practice" as const,
  exam_board: "GL" as const,
  passage_id: "22222222-2222-4222-8222-222222222222",
  passage_version: 1,
  question_ids: [
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
  ],
  time_allowed_seconds: null,
  started_at: "2026-04-17T10:00:00.000Z",
  ended_at: null,
};

describe("SessionSchema", () => {
  it("accepts a valid practice session in progress", () => {
    expect(SessionSchema.safeParse(validSession).success).toBe(true);
  });

  it("accepts a valid test session with timer set", () => {
    expect(
      SessionSchema.safeParse({
        ...validSession,
        mode: "test",
        time_allowed_seconds: 2400,
      }).success,
    ).toBe(true);
  });

  it("accepts a completed session (ended_at set)", () => {
    expect(
      SessionSchema.safeParse({
        ...validSession,
        ended_at: "2026-04-17T10:35:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects empty question_ids", () => {
    expect(
      SessionSchema.safeParse({ ...validSession, question_ids: [] }).success,
    ).toBe(false);
  });

  it("rejects more than 20 questions in a single session", () => {
    const twentyOne = Array.from(
      { length: 21 },
      (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${String(i).padStart(1, "0")}`,
    );
    expect(
      SessionSchema.safeParse({ ...validSession, question_ids: twentyOne })
        .success,
    ).toBe(false);
  });

  it("rejects invalid exam_board", () => {
    expect(
      SessionSchema.safeParse({ ...validSession, exam_board: "AQA" }).success,
    ).toBe(false);
  });

  it("rejects invalid mode", () => {
    expect(
      SessionSchema.safeParse({ ...validSession, mode: "warmup" }).success,
    ).toBe(false);
  });

  it("rejects non-positive user_id", () => {
    expect(
      SessionSchema.safeParse({ ...validSession, user_id: 0 }).success,
    ).toBe(false);
  });

  it("rejects zero time_allowed_seconds (must be positive or null)", () => {
    expect(
      SessionSchema.safeParse({ ...validSession, time_allowed_seconds: 0 })
        .success,
    ).toBe(false);
  });
});
