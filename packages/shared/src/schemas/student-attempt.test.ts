import { describe, it, expect } from "vitest";
import { StudentAttemptSchema } from "./student-attempt.js";

const validAttempt = {
  id: "11111111-1111-4111-8111-111111111111",
  session_id: "22222222-2222-4222-8222-222222222222",
  user_id: 42,
  question_id: "33333333-3333-4333-8333-333333333333",
  question_type_tag: "inference" as const,
  exam_board: "GL" as const,
  difficulty: 2 as const,
  selected_letter: "B" as const,
  is_correct: false,
  time_taken_ms: 4200,
  created_at: "2026-04-17T10:05:00.000Z",
};

describe("StudentAttemptSchema", () => {
  it("accepts a valid attempt", () => {
    expect(StudentAttemptSchema.safeParse(validAttempt).success).toBe(true);
  });

  it("accepts zero time_taken_ms (instant submit)", () => {
    expect(
      StudentAttemptSchema.safeParse({ ...validAttempt, time_taken_ms: 0 })
        .success,
    ).toBe(true);
  });

  it("rejects negative time_taken_ms", () => {
    expect(
      StudentAttemptSchema.safeParse({ ...validAttempt, time_taken_ms: -1 })
        .success,
    ).toBe(false);
  });

  it("rejects invalid question_type_tag", () => {
    expect(
      StudentAttemptSchema.safeParse({
        ...validAttempt,
        question_type_tag: "trick-question",
      }).success,
    ).toBe(false);
  });

  it("rejects is_correct as string", () => {
    expect(
      StudentAttemptSchema.safeParse({ ...validAttempt, is_correct: "yes" })
        .success,
    ).toBe(false);
  });

  it("rejects difficulty out of range", () => {
    expect(
      StudentAttemptSchema.safeParse({ ...validAttempt, difficulty: 5 })
        .success,
    ).toBe(false);
  });

  it("requires valid UUIDs", () => {
    expect(
      StudentAttemptSchema.safeParse({ ...validAttempt, session_id: "not-a-uuid" })
        .success,
    ).toBe(false);
  });
});
