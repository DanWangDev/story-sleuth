import { z } from "zod";
import { OptionLetterSchema } from "../enums.js";
import {
  DifficultySchema,
  ExamBoardSchema,
  QuestionTypeSchema,
} from "../taxonomy.js";

/**
 * An append-only row per (student, session, question) submission. Never
 * updated — if a student retakes the same question in a future session,
 * a new row is inserted. Stats queries dedupe via window function (most
 * recent attempt per (user_id, question_id)) rather than mutating history.
 *
 * The `question_type_tag`, `exam_board`, and `difficulty` fields are
 * DENORMALISED from the question row. This is deliberate: the Phase 2
 * adaptive query runs aggregates over millions of attempt rows and can't
 * afford a join per row. Question rows are immutable-once-published, so
 * denormalised copies never drift from the source of truth.
 */
export const StudentAttemptSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  user_id: z.number().int().positive(),
  question_id: z.string().uuid(),

  /** Denormalised from questions table for fast aggregate queries. */
  question_type_tag: QuestionTypeSchema,
  exam_board: ExamBoardSchema,
  difficulty: DifficultySchema,

  selected_letter: OptionLetterSchema,
  is_correct: z.boolean(),

  /** Time spent on this specific question, not the session as a whole. */
  time_taken_ms: z.number().int().nonnegative(),

  created_at: z.string().datetime(),
});

export type StudentAttempt = z.infer<typeof StudentAttemptSchema>;
