import { z } from "zod";
import { SessionModeSchema } from "../enums.js";
import { ExamBoardSchema } from "../taxonomy.js";

/**
 * A practice or test session. Pins the passage VERSION at creation time so
 * the student never sees text shift if the admin publishes a re-ingestion
 * mid-session (the outside-voice critical gap surfaced during eng review).
 *
 * Feedback timing rule: both practice and test batch feedback to session
 * end. Active session is focused answering only; results view is focused
 * learning. Mode distinction is timer + hint availability, not feedback
 * delivery.
 */
export const SessionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.number().int().positive(),

  mode: SessionModeSchema,
  exam_board: ExamBoardSchema,

  passage_id: z.string().uuid(),
  passage_version: z.number().int().positive(),

  /** The question ids in this session, in display order. */
  question_ids: z.array(z.string().uuid()).min(1).max(20),

  /** For test mode: the total allowed time in seconds. */
  time_allowed_seconds: z.number().int().positive().nullable(),

  started_at: z.string().datetime(),
  ended_at: z.string().datetime().nullable(),
});

export type Session = z.infer<typeof SessionSchema>;
