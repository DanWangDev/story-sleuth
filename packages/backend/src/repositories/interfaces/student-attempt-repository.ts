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

/**
 * User-level rollup consumed by the hub stats API. Every breakdown uses
 * the same dedup rule as getTypeAccuracyForUser — most-recent attempt
 * per (user_id, question_id) — so retakes don't inflate totals.
 */
export interface UserStatsSummary {
  /** Total distinct questions the user has answered (deduped). */
  questions_answered: number;
  /** How many of those the user got right on the most recent attempt. */
  questions_correct: number;
  /** 0..1. 0 when questions_answered === 0. */
  overall_accuracy: number;
  /** How many completed sessions (ended_at IS NOT NULL). */
  sessions_completed: number;
  /** Per-exam-board breakdown. */
  by_exam_board: Array<{
    exam_board: ExamBoard;
    total_attempts: number;
    correct_count: number;
    accuracy: number;
  }>;
  /** Per-question-type breakdown (from getTypeAccuracyForUser). */
  by_question_type: QuestionTypeAccuracy[];
  /** Per-difficulty breakdown. */
  by_difficulty: Array<{
    difficulty: 1 | 2 | 3;
    total_attempts: number;
    correct_count: number;
    accuracy: number;
  }>;
  /** ISO timestamp of the user's most recent attempt, or null. */
  last_attempt_at: string | null;
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

  /**
   * Everything the hub's dashboard needs for one user, in one query
   * batch. Deduplicates via the same most-recent-attempt-per-question
   * rule as getTypeAccuracyForUser so retakes don't double-count.
   *
   * `sessions_completed` is read from the sessions table, not
   * student_attempts, so sessions where the user quit after answering
   * zero questions still count.
   */
  getUserStatsSummary(user_id: number): Promise<UserStatsSummary>;
}
