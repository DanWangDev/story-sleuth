import { describe, it, expect } from "vitest";
import {
  QUESTION_TYPES,
  EXAM_BOARDS,
  DIFFICULTIES,
  type QuestionType,
  type ExamBoard,
  type Difficulty,
} from "./taxonomy.js";

describe("taxonomy constants", () => {
  it("QUESTION_TYPES contains the six canonical types", () => {
    expect(QUESTION_TYPES).toEqual([
      "retrieval",
      "inference",
      "vocabulary-in-context",
      "authors-intent",
      "figurative-language",
      "structure-and-organization",
    ]);
  });

  it("EXAM_BOARDS covers CEM, GL, ISEB", () => {
    expect(EXAM_BOARDS).toEqual(["CEM", "GL", "ISEB"]);
  });

  it("DIFFICULTIES is 1-3", () => {
    expect(DIFFICULTIES).toEqual([1, 2, 3]);
  });

  it("types narrow correctly", () => {
    const t: QuestionType = "inference";
    const b: ExamBoard = "GL";
    const d: Difficulty = 2;
    expect(t).toBe("inference");
    expect(b).toBe("GL");
    expect(d).toBe(2);
  });
});
