import type {
  StudentAttempt,
  QuestionType,
  ExamBoard,
  Difficulty,
  OptionLetter,
} from "@story-sleuth/shared";

export interface StudentAttemptCreateInput {
  session_id: string;
  user_id: number;
  question_id: string;
  /** Denormalised from the question row (see 005 migration comment). */
  question_type_tag: QuestionType;
  exam_board: ExamBoard;
  difficulty: Difficulty;
  selected_letter: OptionLetter;
  is_correct: boolean;
  time_taken_ms: number;
}

/**
 * Aggregated stats for one (user, question_type) pair. Returned by the
 * stats API and consumed by the Phase 2 adaptive engine. Uses
 * most-recent-attempt-per-question so retakes don't double-count.
 */
export interface QuestionTypeAccuracy {
  question_type_tag: QuestionType;
  total_attempts: number;
  correct_count: number;
  /** 0..1 */
  accuracy: number;
}

export interface StudentAttemptRepository {
  findBySession(session_id: string): Promise<StudentAttempt[]>;

  create(input: StudentAttemptCreateInput): Promise<StudentAttempt>;

  /**
   * Accuracy broken down by question_type_tag. Deduplicates via
   * DISTINCT ON (user_id, question_id) ORDER BY created_at DESC so
   * retakes count only the most recent attempt per question.
   * Optionally scoped to a specific exam board.
   */
  getTypeAccuracyForUser(
    user_id: number,
    exam_board?: ExamBoard,
  ): Promise<QuestionTypeAccuracy[]>;
}
