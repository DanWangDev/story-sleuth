import { z } from "zod";
import { ContentStatusSchema, OptionLetterSchema } from "../enums.js";
import {
  DifficultySchema,
  ExamBoardSchema,
  QuestionTypeSchema,
} from "../taxonomy.js";

/**
 * A single multiple-choice option. Includes the text shown to the student
 * AND a pre-generated explanation of what choosing this option reveals —
 * whether the option is correct or wrong. This implements the two-tier
 * coaching design (per-option explanations are instant/free to serve; only
 * the deeper walk-through hits a live LLM).
 */
export const QuestionOptionSchema = z.object({
  letter: OptionLetterSchema,
  text: z.string().min(1).max(500),
  /**
   * Per-option explanation. For the correct option: "why this is right,
   * citing passage evidence." For wrong options: "why this is tempting,
   * what misreading it represents, what text evidence points elsewhere."
   */
  explanation_if_chosen: z.string().min(1).max(2000),
});

export type QuestionOption = z.infer<typeof QuestionOptionSchema>;

/**
 * Cross-field invariant for any question-shaped object. Pulled out so
 * Question and GeneratedQuestion share identical validation.
 */
function refineOptionLetters(
  q: { options: Array<{ letter: string }>; correct_option: string },
  ctx: z.RefinementCtx,
): void {
  const letters = q.options.map((o) => o.letter);
  const distinct = new Set(letters);
  if (distinct.size !== letters.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["options"],
      message: "Option letters must be unique",
    });
  }
  if (!letters.includes(q.correct_option)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["correct_option"],
      message: `correct_option "${q.correct_option}" must match an option letter (${letters.join(", ")})`,
    });
  }
}

/**
 * A multiple-choice comprehension question tied to a specific passage
 * version. The outside-voice critical miss: exam_boards MUST be first-class
 * on the question (not just the passage) because CEM / GL / ISEB have
 * structurally different question formats — a student sitting GL should
 * only see GL-style questions about a shared passage.
 */
export const QuestionSchema = z
  .object({
    id: z.string().uuid(),
    passage_id: z.string().uuid(),
    passage_version: z.number().int().positive(),

    text: z.string().min(1).max(1000),
    question_type: QuestionTypeSchema,

    /** Exam board styles this question is written for. */
    exam_boards: z.array(ExamBoardSchema).nonempty().max(3),

    difficulty: DifficultySchema,

    options: z
      .array(QuestionOptionSchema)
      .length(4, "Phase 1 questions always have 4 options"),

    correct_option: OptionLetterSchema,

    status: ContentStatusSchema,

    created_at: z.string().datetime(),
    published_at: z.string().datetime().nullable(),
  })
  .superRefine(refineOptionLetters);

export type Question = z.infer<typeof QuestionSchema>;

/**
 * Shape of a single question coming back from the LLM question-generation
 * pipeline. Lacks server-assigned fields (id, status, timestamps) — those
 * are set when the entity is inserted as `status: draft`.
 */
export const GeneratedQuestionSchema = z
  .object({
    text: z.string().min(1).max(1000),
    question_type: QuestionTypeSchema,
    exam_boards: z.array(ExamBoardSchema).nonempty().max(3),
    difficulty: DifficultySchema,
    options: z.array(QuestionOptionSchema).length(4),
    correct_option: OptionLetterSchema,
  })
  .superRefine(refineOptionLetters);

export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;
