import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type {
  Question,
  QuestionOption,
  QuestionType,
  ExamBoard,
  ContentStatus,
  OptionLetter,
} from "@story-sleuth/shared";
import type {
  QuestionCreateInput,
  QuestionRepository,
} from "../interfaces/question-repository.js";

type Row = {
  id: string;
  passage_id: string;
  passage_version: number;
  text: string;
  question_type: QuestionType;
  exam_boards: ExamBoard[];
  difficulty: number;
  options: QuestionOption[];
  correct_option: OptionLetter;
  status: ContentStatus;
  created_at: Date;
  published_at: Date | null;
};

function rowToQuestion(r: Row): Question {
  if (r.exam_boards.length === 0) {
    throw new Error(`question ${r.id} has empty exam_boards`);
  }
  return {
    id: r.id,
    passage_id: r.passage_id,
    passage_version: r.passage_version,
    text: r.text,
    question_type: r.question_type,
    exam_boards: r.exam_boards as [ExamBoard, ...ExamBoard[]],
    difficulty: r.difficulty as 1 | 2 | 3,
    options: r.options,
    correct_option: r.correct_option,
    status: r.status,
    created_at: r.created_at.toISOString(),
    published_at: r.published_at?.toISOString() ?? null,
  };
}

const SELECT_COLS = `
  id, passage_id, passage_version, text, question_type, exam_boards,
  difficulty, options, correct_option, status, created_at, published_at
`;

export class PostgresQuestionRepository implements QuestionRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async findById(id: string): Promise<Question | null> {
    const rows = await this.sql<Row[]>`
      SELECT ${this.sql.unsafe(SELECT_COLS)}
      FROM questions WHERE id = ${id}
    `;
    return rows[0] ? rowToQuestion(rows[0]) : null;
  }

  async findByPassage(
    passage_id: string,
    passage_version: number,
    status?: ContentStatus,
  ): Promise<Question[]> {
    const rows = status
      ? await this.sql<Row[]>`
          SELECT ${this.sql.unsafe(SELECT_COLS)}
          FROM questions
          WHERE passage_id = ${passage_id}
            AND passage_version = ${passage_version}
            AND status = ${status}::content_status
          ORDER BY created_at ASC
        `
      : await this.sql<Row[]>`
          SELECT ${this.sql.unsafe(SELECT_COLS)}
          FROM questions
          WHERE passage_id = ${passage_id}
            AND passage_version = ${passage_version}
          ORDER BY created_at ASC
        `;
    return rows.map(rowToQuestion);
  }

  async findBySessionQuestionIds(ids: string[]): Promise<Question[]> {
    if (ids.length === 0) return [];
    const idsLiteral = `{${ids.join(",")}}`;
    const rows = await this.sql<Row[]>`
      SELECT ${this.sql.unsafe(SELECT_COLS)}
      FROM questions
      WHERE id = ANY(${idsLiteral}::uuid[])
    `;
    // Preserve caller-supplied ordering.
    const byId = new Map(rows.map((r) => [r.id, rowToQuestion(r)]));
    return ids
      .map((id) => byId.get(id))
      .filter((q): q is Question => q !== undefined);
  }

  async listPendingReview(limit: number, offset: number): Promise<Question[]> {
    const rows = await this.sql<Row[]>`
      SELECT ${this.sql.unsafe(SELECT_COLS)}
      FROM questions
      WHERE status = 'pending_review'
      ORDER BY created_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return rows.map(rowToQuestion);
  }

  async createMany(inputs: QuestionCreateInput[]): Promise<Question[]> {
    if (inputs.length === 0) return [];
    const results: Question[] = [];
    await this.sql.begin(async (tx) => {
      for (const input of inputs) {
        const id = randomUUID();
        const status: ContentStatus = input.status ?? "draft";
        const examBoardsLiteral = `{${input.exam_boards.join(",")}}`;
        const rows = await tx<Row[]>`
          INSERT INTO questions (
            id, passage_id, passage_version, text, question_type,
            exam_boards, difficulty, options, correct_option, status,
            published_at
          ) VALUES (
            ${id}, ${input.passage_id}, ${input.passage_version},
            ${input.text}, ${input.question_type}::question_type,
            ${examBoardsLiteral}::exam_board[],
            ${input.difficulty},
            ${tx.json(input.options)},
            ${input.correct_option}::option_letter,
            ${status}::content_status,
            ${status === "published" ? tx`NOW()` : null}
          )
          RETURNING ${tx.unsafe(SELECT_COLS)}
        `;
        if (!rows[0]) throw new Error("insert returned no row");
        results.push(rowToQuestion(rows[0]));
      }
    });
    return results;
  }

  async updateStatus(id: string, status: ContentStatus): Promise<Question> {
    const rows = await this.sql<Row[]>`
      UPDATE questions
      SET status = ${status}::content_status,
          published_at = CASE
            WHEN ${status} = 'published' AND published_at IS NULL THEN NOW()
            ELSE published_at
          END
      WHERE id = ${id}
      RETURNING ${this.sql.unsafe(SELECT_COLS)}
    `;
    if (!rows[0]) throw new Error(`question not found: id=${id}`);
    return rowToQuestion(rows[0]);
  }
}
