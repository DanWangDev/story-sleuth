import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type { Session, SessionMode, ExamBoard } from "@story-sleuth/shared";
import type {
  SessionCreateInput,
  SessionRepository,
} from "../interfaces/session-repository.js";

type Row = {
  id: string;
  user_id: string | number;
  mode: SessionMode;
  exam_board: ExamBoard;
  passage_id: string;
  passage_version: number;
  question_ids: string[];
  time_allowed_seconds: number | null;
  started_at: Date;
  ended_at: Date | null;
};

function rowToSession(r: Row): Session {
  return {
    id: r.id,
    user_id: Number(r.user_id),
    mode: r.mode,
    exam_board: r.exam_board,
    passage_id: r.passage_id,
    passage_version: r.passage_version,
    question_ids: r.question_ids,
    time_allowed_seconds: r.time_allowed_seconds,
    started_at: r.started_at.toISOString(),
    ended_at: r.ended_at?.toISOString() ?? null,
  };
}

const SELECT_COLS = `
  id, user_id, mode, exam_board, passage_id, passage_version,
  question_ids, time_allowed_seconds, started_at, ended_at
`;

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async findById(id: string): Promise<Session | null> {
    const rows = await this.sql<Row[]>`
      SELECT ${this.sql.unsafe(SELECT_COLS)}
      FROM sessions WHERE id = ${id}
    `;
    return rows[0] ? rowToSession(rows[0]) : null;
  }

  async findInProgressByUser(user_id: number): Promise<Session[]> {
    const rows = await this.sql<Row[]>`
      SELECT ${this.sql.unsafe(SELECT_COLS)}
      FROM sessions
      WHERE user_id = ${user_id} AND ended_at IS NULL
      ORDER BY started_at DESC
    `;
    return rows.map(rowToSession);
  }

  async create(input: SessionCreateInput): Promise<Session> {
    const id = randomUUID();
    const questionIdsLiteral = `{${input.question_ids.join(",")}}`;
    const rows = await this.sql<Row[]>`
      INSERT INTO sessions (
        id, user_id, mode, exam_board, passage_id, passage_version,
        question_ids, time_allowed_seconds
      ) VALUES (
        ${id}, ${input.user_id}, ${input.mode}::session_mode,
        ${input.exam_board}::exam_board, ${input.passage_id},
        ${input.passage_version},
        ${questionIdsLiteral}::uuid[],
        ${input.time_allowed_seconds}
      )
      RETURNING ${this.sql.unsafe(SELECT_COLS)}
    `;
    if (!rows[0]) throw new Error("insert returned no row");
    return rowToSession(rows[0]);
  }

  async markEnded(id: string, ended_at: Date = new Date()): Promise<Session> {
    const rows = await this.sql<Row[]>`
      UPDATE sessions
      SET ended_at = COALESCE(ended_at, ${ended_at}::timestamptz)
      WHERE id = ${id}
      RETURNING ${this.sql.unsafe(SELECT_COLS)}
    `;
    if (!rows[0]) throw new Error(`session not found: id=${id}`);
    return rowToSession(rows[0]);
  }
}
