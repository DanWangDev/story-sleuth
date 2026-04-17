import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type {
  StudentAttempt,
  QuestionType,
  ExamBoard,
  OptionLetter,
} from "@story-sleuth/shared";
import type {
  StudentAttemptCreateInput,
  StudentAttemptRepository,
  QuestionTypeAccuracy,
  UserStatsSummary,
} from "../interfaces/student-attempt-repository.js";

type Row = {
  id: string;
  session_id: string;
  user_id: string | number;
  question_id: string;
  question_type_tag: QuestionType;
  exam_board: ExamBoard;
  difficulty: number;
  selected_letter: OptionLetter;
  is_correct: boolean;
  time_taken_ms: number;
  created_at: Date;
};

function rowToAttempt(r: Row): StudentAttempt {
  return {
    id: r.id,
    session_id: r.session_id,
    user_id: Number(r.user_id),
    question_id: r.question_id,
    question_type_tag: r.question_type_tag,
    exam_board: r.exam_board,
    difficulty: r.difficulty as 1 | 2 | 3,
    selected_letter: r.selected_letter,
    is_correct: r.is_correct,
    time_taken_ms: r.time_taken_ms,
    created_at: r.created_at.toISOString(),
  };
}

const SELECT_COLS = `
  id, session_id, user_id, question_id, question_type_tag,
  exam_board, difficulty, selected_letter, is_correct,
  time_taken_ms, created_at
`;

export class PostgresStudentAttemptRepository
  implements StudentAttemptRepository
{
  constructor(private readonly sql: postgres.Sql) {}

  async findBySession(session_id: string): Promise<StudentAttempt[]> {
    const rows = await this.sql<Row[]>`
      SELECT ${this.sql.unsafe(SELECT_COLS)}
      FROM student_attempts
      WHERE session_id = ${session_id}
      ORDER BY created_at ASC
    `;
    return rows.map(rowToAttempt);
  }

  async create(input: StudentAttemptCreateInput): Promise<StudentAttempt> {
    const id = randomUUID();
    const rows = await this.sql<Row[]>`
      INSERT INTO student_attempts (
        id, session_id, user_id, question_id, question_type_tag,
        exam_board, difficulty, selected_letter, is_correct, time_taken_ms
      ) VALUES (
        ${id}, ${input.session_id}, ${input.user_id}, ${input.question_id},
        ${input.question_type_tag}::question_type,
        ${input.exam_board}::exam_board,
        ${input.difficulty},
        ${input.selected_letter}::option_letter,
        ${input.is_correct}, ${input.time_taken_ms}
      )
      RETURNING ${this.sql.unsafe(SELECT_COLS)}
    `;
    if (!rows[0]) throw new Error("insert returned no row");
    return rowToAttempt(rows[0]);
  }

  async getTypeAccuracyForUser(
    user_id: number,
    exam_board?: ExamBoard,
  ): Promise<QuestionTypeAccuracy[]> {
    type AggregateRow = {
      question_type_tag: QuestionType;
      total_attempts: string | number;
      correct_count: string | number;
    };

    /**
     * Dedup rule (outside-voice fix): count only the most-recent attempt
     * per (user_id, question_id). DISTINCT ON + ORDER BY gives us one
     * row per question; the outer aggregate counts across question_type.
     */
    const rows = exam_board
      ? await this.sql<AggregateRow[]>`
          WITH latest AS (
            SELECT DISTINCT ON (user_id, question_id)
              question_type_tag, is_correct, exam_board
            FROM student_attempts
            WHERE user_id = ${user_id}
            ORDER BY user_id, question_id, created_at DESC
          )
          SELECT question_type_tag,
                 COUNT(*) AS total_attempts,
                 SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct_count
          FROM latest
          WHERE exam_board = ${exam_board}::exam_board
          GROUP BY question_type_tag
          ORDER BY question_type_tag
        `
      : await this.sql<AggregateRow[]>`
          WITH latest AS (
            SELECT DISTINCT ON (user_id, question_id)
              question_type_tag, is_correct
            FROM student_attempts
            WHERE user_id = ${user_id}
            ORDER BY user_id, question_id, created_at DESC
          )
          SELECT question_type_tag,
                 COUNT(*) AS total_attempts,
                 SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct_count
          FROM latest
          GROUP BY question_type_tag
          ORDER BY question_type_tag
        `;

    return rows.map((r) => {
      const total = Number(r.total_attempts);
      const correct = Number(r.correct_count);
      return {
        question_type_tag: r.question_type_tag,
        total_attempts: total,
        correct_count: correct,
        accuracy: total === 0 ? 0 : correct / total,
      };
    });
  }

  async getUserStatsSummary(user_id: number): Promise<UserStatsSummary> {
    /**
     * Strategy: one CTE that picks the most-recent attempt per
     * (user_id, question_id) via DISTINCT ON, and then run every
     * breakdown in parallel over the same latest-set. Sessions count
     * comes from a separate query because it doesn't depend on
     * attempts at all.
     *
     * We can't reuse a single SQL CTE across multiple outer queries
     * with postgres.js without a transaction wrapper, so each rollup
     * repeats the CTE. The per-user data is small (10s-100s of rows);
     * Postgres handles the repeated scan off the
     * student_attempts_user_question_recent_idx index.
     */

    type BoardRow = {
      exam_board: ExamBoard;
      total_attempts: string | number;
      correct_count: string | number;
    };
    type DiffRow = {
      difficulty: number;
      total_attempts: string | number;
      correct_count: string | number;
    };
    type OverallRow = {
      total_attempts: string | number;
      correct_count: string | number;
      last_attempt_at: Date | null;
    };
    type SessionsRow = { completed: string | number };

    const [overallRows, boardRows, diffRows, sessionsRows, typeAccuracy] =
      await Promise.all([
        this.sql<OverallRow[]>`
          WITH latest AS (
            SELECT DISTINCT ON (user_id, question_id)
              is_correct, created_at
            FROM student_attempts
            WHERE user_id = ${user_id}
            ORDER BY user_id, question_id, created_at DESC
          )
          SELECT COUNT(*) AS total_attempts,
                 SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct_count,
                 MAX(created_at) AS last_attempt_at
          FROM latest
        `,
        this.sql<BoardRow[]>`
          WITH latest AS (
            SELECT DISTINCT ON (user_id, question_id)
              exam_board, is_correct
            FROM student_attempts
            WHERE user_id = ${user_id}
            ORDER BY user_id, question_id, created_at DESC
          )
          SELECT exam_board,
                 COUNT(*) AS total_attempts,
                 SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct_count
          FROM latest
          GROUP BY exam_board
          ORDER BY exam_board
        `,
        this.sql<DiffRow[]>`
          WITH latest AS (
            SELECT DISTINCT ON (user_id, question_id)
              difficulty, is_correct
            FROM student_attempts
            WHERE user_id = ${user_id}
            ORDER BY user_id, question_id, created_at DESC
          )
          SELECT difficulty,
                 COUNT(*) AS total_attempts,
                 SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct_count
          FROM latest
          GROUP BY difficulty
          ORDER BY difficulty
        `,
        this.sql<SessionsRow[]>`
          SELECT COUNT(*) AS completed
          FROM sessions
          WHERE user_id = ${user_id} AND ended_at IS NOT NULL
        `,
        this.getTypeAccuracyForUser(user_id),
      ]);

    const overall = overallRows[0];
    const total = overall ? Number(overall.total_attempts) : 0;
    const correct = overall ? Number(overall.correct_count) : 0;

    return {
      questions_answered: total,
      questions_correct: correct,
      overall_accuracy: total === 0 ? 0 : correct / total,
      sessions_completed: sessionsRows[0]
        ? Number(sessionsRows[0].completed)
        : 0,
      by_exam_board: boardRows.map((r) => {
        const t = Number(r.total_attempts);
        const c = Number(r.correct_count);
        return {
          exam_board: r.exam_board,
          total_attempts: t,
          correct_count: c,
          accuracy: t === 0 ? 0 : c / t,
        };
      }),
      by_question_type: typeAccuracy,
      by_difficulty: diffRows.map((r) => {
        const t = Number(r.total_attempts);
        const c = Number(r.correct_count);
        return {
          difficulty: r.difficulty as 1 | 2 | 3,
          total_attempts: t,
          correct_count: c,
          accuracy: t === 0 ? 0 : c / t,
        };
      }),
      last_attempt_at:
        overall && overall.last_attempt_at
          ? overall.last_attempt_at.toISOString()
          : null,
    };
  }
}
