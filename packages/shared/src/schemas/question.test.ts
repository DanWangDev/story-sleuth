import { describe, it, expect } from "vitest";
import {
  QuestionSchema,
  GeneratedQuestionSchema,
  QuestionOptionSchema,
} from "./question.js";

const validOption = (letter: "A" | "B" | "C" | "D", text = "An option"): {
  letter: "A" | "B" | "C" | "D";
  text: string;
  explanation_if_chosen: string;
} => ({
  letter,
  text,
  explanation_if_chosen: `Explanation for ${letter}`,
});

const baseValidQuestion = {
  id: "11111111-1111-4111-8111-111111111111",
  passage_id: "22222222-2222-4222-8222-222222222222",
  passage_version: 1,
  text: "What does the word 'scrabbled' suggest?",
  question_type: "vocabulary-in-context" as const,
  exam_boards: ["GL"] as const,
  difficulty: 2 as const,
  options: [validOption("A"), validOption("B"), validOption("C"), validOption("D")],
  correct_option: "B" as const,
  status: "published" as const,
  created_at: "2026-04-17T10:00:00.000Z",
  published_at: "2026-04-17T11:00:00.000Z",
};

describe("QuestionOptionSchema", () => {
  it("accepts a valid option", () => {
    const result = QuestionOptionSchema.safeParse(validOption("A"));
    expect(result.success).toBe(true);
  });

  it("rejects empty explanation", () => {
    const result = QuestionOptionSchema.safeParse({
      ...validOption("A"),
      explanation_if_chosen: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid letter", () => {
    const result = QuestionOptionSchema.safeParse({
      ...validOption("A"),
      letter: "E",
    });
    expect(result.success).toBe(false);
  });
});

describe("QuestionSchema", () => {
  it("accepts a valid question", () => {
    const result = QuestionSchema.safeParse(baseValidQuestion);
    expect(result.success).toBe(true);
  });

  it("rejects fewer than 4 options", () => {
    const result = QuestionSchema.safeParse({
      ...baseValidQuestion,
      options: [validOption("A"), validOption("B"), validOption("C")],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 4 options", () => {
    const result = QuestionSchema.safeParse({
      ...baseValidQuestion,
      options: [
        validOption("A"),
        validOption("B"),
        validOption("C"),
        validOption("D"),
        validOption("A", "extra"),
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate option letters", () => {
    const result = QuestionSchema.safeParse({
      ...baseValidQuestion,
      options: [
        validOption("A"),
        validOption("A", "dup"),
        validOption("C"),
        validOption("D"),
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("options");
    }
  });

  it("rejects correct_option that is not in the options list", () => {
    // All 4 options present (A-D) but we claim the correct is something
    // not actually one of them by mutating the letter on D.
    const result = QuestionSchema.safeParse({
      ...baseValidQuestion,
      options: [
        validOption("A"),
        validOption("B"),
        validOption("C"),
        { ...validOption("D"), letter: "A" }, // creates dup
      ],
      correct_option: "D",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid exam_boards (empty array)", () => {
    const result = QuestionSchema.safeParse({
      ...baseValidQuestion,
      exam_boards: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects difficulty outside 1-3", () => {
    const result = QuestionSchema.safeParse({
      ...baseValidQuestion,
      difficulty: 4,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown question_type tag", () => {
    const result = QuestionSchema.safeParse({
      ...baseValidQuestion,
      question_type: "trick-question",
    });
    expect(result.success).toBe(false);
  });

  it("allows published_at to be null (draft/pending)", () => {
    const result = QuestionSchema.safeParse({
      ...baseValidQuestion,
      status: "draft",
      published_at: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts multi-board questions", () => {
    const result = QuestionSchema.safeParse({
      ...baseValidQuestion,
      exam_boards: ["GL", "CEM"],
    });
    expect(result.success).toBe(true);
  });
});

describe("GeneratedQuestionSchema", () => {
  const generated = {
    text: baseValidQuestion.text,
    question_type: baseValidQuestion.question_type,
    exam_boards: baseValidQuestion.exam_boards,
    difficulty: baseValidQuestion.difficulty,
    options: baseValidQuestion.options,
    correct_option: baseValidQuestion.correct_option,
  };

  it("accepts an LLM-generated question with no server-assigned fields", () => {
    const result = GeneratedQuestionSchema.safeParse(generated);
    expect(result.success).toBe(true);
  });

  it("rejects if the LLM returns mismatched correct_option", () => {
    const result = GeneratedQuestionSchema.safeParse({
      ...generated,
      correct_option: "B",
      options: [
        validOption("A"),
        validOption("C"),
        validOption("D"),
        { ...validOption("B"), letter: "A" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects if the LLM forgets a required field", () => {
    const { correct_option: _correct, ...incomplete } = generated;
    const result = GeneratedQuestionSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});
