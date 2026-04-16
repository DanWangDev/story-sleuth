import { z } from "zod";

/**
 * Question-type taxonomy. Every generated question is tagged with ONE of
 * these. The adaptive engine (Phase 2) weights next-session selection by
 * accuracy per tag.
 */
export const QUESTION_TYPES = [
  "retrieval",
  "inference",
  "vocabulary-in-context",
  "authors-intent",
  "figurative-language",
  "structure-and-organization",
] as const;

export const QuestionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

/**
 * UK 11+ exam boards. Each has distinct question style conventions.
 * Questions are tagged with one or more boards they're appropriate for.
 */
export const EXAM_BOARDS = ["CEM", "GL", "ISEB"] as const;

export const ExamBoardSchema = z.enum(EXAM_BOARDS);
export type ExamBoard = z.infer<typeof ExamBoardSchema>;

/**
 * Difficulty scale for passages and questions.
 *   1 — accessible Year 5 level
 *   2 — solid Year 5-6 level
 *   3 — stretch Year 6 level (period prose, dense vocabulary)
 */
export const DIFFICULTIES = [1, 2, 3] as const;

export const DifficultySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type Difficulty = z.infer<typeof DifficultySchema>;
