/**
 * Question-type taxonomy. Every generated question is tagged with ONE of these.
 * The adaptive engine (Phase 2) weights next-session selection by accuracy per tag.
 */
export const QUESTION_TYPES = [
  "retrieval",
  "inference",
  "vocabulary-in-context",
  "authors-intent",
  "figurative-language",
  "structure-and-organization",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

/**
 * UK 11+ exam boards. Each has distinct question style conventions.
 * Questions are tagged with one or more boards they're appropriate for.
 */
export const EXAM_BOARDS = ["CEM", "GL", "ISEB"] as const;

export type ExamBoard = (typeof EXAM_BOARDS)[number];

/**
 * Difficulty scale for passages and questions.
 *   1 — accessible Year 5 level
 *   2 — solid Year 5-6 level
 *   3 — stretch Year 6 level (period prose, dense vocabulary)
 */
export const DIFFICULTIES = [1, 2, 3] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];
