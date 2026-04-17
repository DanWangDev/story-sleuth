import type { Session, SessionMode, ExamBoard } from "@story-sleuth/shared";

export interface SessionCreateInput {
  user_id: number;
  mode: SessionMode;
  exam_board: ExamBoard;
  passage_id: string;
  passage_version: number;
  question_ids: string[];
  /** For test mode, the total allowed time in seconds. Null in practice. */
  time_allowed_seconds: number | null;
}

export interface SessionRepository {
  findById(id: string): Promise<Session | null>;

  /** "Continue where you left off" card on the student landing page. */
  findInProgressByUser(user_id: number): Promise<Session[]>;

  create(input: SessionCreateInput): Promise<Session>;

  /** Mark a session complete. Idempotent (re-calling after end is a no-op
   *  that returns the existing row). */
  markEnded(id: string, ended_at?: Date): Promise<Session>;
}
