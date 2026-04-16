import { describe, it, expect } from "vitest";
import {
  QUESTION_TYPES,
  QuestionTypeSchema,
  EXAM_BOARDS,
  ExamBoardSchema,
  DIFFICULTIES,
  DifficultySchema,
  type QuestionType,
  type ExamBoard,
  type Difficulty,
} from "./taxonomy.js";

describe("QUESTION_TYPES", () => {
  it("contains the six canonical types", () => {
    expect(QUESTION_TYPES).toEqual([
      "retrieval",
      "inference",
      "vocabulary-in-context",
      "authors-intent",
      "figurative-language",
      "structure-and-organization",
    ]);
  });

  it("QuestionTypeSchema accepts every constant", () => {
    for (const t of QUESTION_TYPES) {
      expect(QuestionTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it("QuestionTypeSchema rejects unknown tags", () => {
    expect(QuestionTypeSchema.safeParse("trick-question").success).toBe(false);
  });
});

describe("EXAM_BOARDS", () => {
  it("covers CEM, GL, ISEB", () => {
    expect(EXAM_BOARDS).toEqual(["CEM", "GL", "ISEB"]);
  });

  it("ExamBoardSchema accepts every board", () => {
    for (const b of EXAM_BOARDS) {
      expect(ExamBoardSchema.safeParse(b).success).toBe(true);
    }
  });

  it("ExamBoardSchema rejects unknown board", () => {
    expect(ExamBoardSchema.safeParse("AQA").success).toBe(false);
  });
});

describe("DIFFICULTIES", () => {
  it("is 1-3", () => {
    expect(DIFFICULTIES).toEqual([1, 2, 3]);
  });

  it("DifficultySchema accepts 1, 2, 3", () => {
    for (const d of DIFFICULTIES) {
      expect(DifficultySchema.safeParse(d).success).toBe(true);
    }
  });

  it("DifficultySchema rejects 0 and 4", () => {
    expect(DifficultySchema.safeParse(0).success).toBe(false);
    expect(DifficultySchema.safeParse(4).success).toBe(false);
  });
});

describe("exported types compile", () => {
  it("narrow correctly", () => {
    const t: QuestionType = "inference";
    const b: ExamBoard = "GL";
    const d: Difficulty = 2;
    expect(t).toBe("inference");
    expect(b).toBe("GL");
    expect(d).toBe(2);
  });
});
