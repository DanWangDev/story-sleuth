import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type {
  Passage,
  ExamBoard,
  ContentStatus,
} from "@story-sleuth/shared";
import type {
  PassageCreateInput,
  PassageRepository,
} from "../interfaces/passage-repository.js";

type Row = {
  id: string;
  version: number;
  title: string;
  author: string;
  source: string;
  source_url: string;
  year_published: number;
  genre: Passage["genre"];
  subgenre: string;
  exam_boards: ExamBoard[];
  difficulty: number;
  reading_level: string;
  word_count: number;
  themes: string[];
  body: string;
  status: ContentStatus;
  created_at: Date;
  published_at: Date | null;
};

function rowToPassage(r: Row): Passage {
  if (r.exam_boards.length === 0) {
    throw new Error(`passage ${r.id} v${r.version} has empty exam_boards`);
  }
  return {
    id: r.id,
    version: r.version,
    title: r.title,
    author: r.author,
    source: r.source,
    source_url: r.source_url,
    year_published: r.year_published,
    genre: r.genre,
    subgenre: r.subgenre,
    exam_boards: r.exam_boards as [ExamBoard, ...ExamBoard[]],
    difficulty: r.difficulty as 1 | 2 | 3,
    reading_level: r.reading_level,
    word_count: r.word_count,
    themes: r.themes,
    body: r.body,
    status: r.status,
    created_at: r.created_at.toISOString(),
    published_at: r.published_at?.toISOString() ?? null,
  };
}

const SELECT_COLS = `
  id, version, title, author, source, source_url, year_published,
  genre, subgenre, exam_boards, difficulty, reading_level,
  word_count, themes, body, status, created_at, published_at
`;

export class PostgresPassageRepository implements PassageRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async findById(id: string, version: number): Promise<Passage | null> {
    const rows = await this.sql<Row[]>`
      SELECT ${this.sql.unsafe(SELECT_COLS)}
      FROM passages WHERE id = ${id} AND version = ${version}
    `;
    return rows[0] ? rowToPassage(rows[0]) : null;
  }

  async findLatestPublishedById(id: string): Promise<Passage | null> {
    const rows = await this.sql<Row[]>`
      SELECT ${this.sql.unsafe(SELECT_COLS)}
      FROM passages
      WHERE id = ${id} AND status = 'published'
      ORDER BY version DESC
      LIMIT 1
    `;
    return rows[0] ? rowToPassage(rows[0]) : null;
  }

  async listPublishedByExamBoard(
    examBoard: ExamBoard,
    limit: number,
    offset: number,
  ): Promise<Passage[]> {
    const rows = await this.sql<Row[]>`
      SELECT DISTINCT ON (id) ${this.sql.unsafe(SELECT_COLS)}
      FROM passages
      WHERE status = 'published' AND ${examBoard}::exam_board = ANY(exam_boards)
      ORDER BY id, version DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return rows.map(rowToPassage);
  }

  async listPendingReview(limit: number, offset: number): Promise<Passage[]> {
    const rows = await this.sql<Row[]>`
      SELECT ${this.sql.unsafe(SELECT_COLS)}
      FROM passages
      WHERE status = 'pending_review'
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return rows.map(rowToPassage);
  }

  async create(input: PassageCreateInput): Promise<Passage> {
    const id = input.existing_id ?? randomUUID();
    const status: ContentStatus = input.status ?? "draft";

    // Determine version: new id ⇒ 1; existing id ⇒ max(version)+1.
    // Run inside a transaction so concurrent re-ingestion of the same
    // passage can't pick the same version number.
    return await this.sql.begin(async (tx) => {
      let version = 1;
      if (input.existing_id) {
        const prev = await tx<{ max_version: number | null }[]>`
          SELECT MAX(version) AS max_version FROM passages WHERE id = ${id}
        `;
        version = (prev[0]?.max_version ?? 0) + 1;
      }

      // Custom enum arrays need an explicit array-literal string; postgres.js's
      // parameter serialiser can't encode enum-element values on its own.
      const examBoardsLiteral = `{${input.exam_boards.join(",")}}`;
      const themesLiteral = `{${input.themes.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}`;

      const rows = await tx<Row[]>`
        INSERT INTO passages (
          id, version, title, author, source, source_url, year_published,
          genre, subgenre, exam_boards, difficulty, reading_level,
          word_count, themes, body, status, published_at
        ) VALUES (
          ${id}, ${version}, ${input.title}, ${input.author}, ${input.source},
          ${input.source_url}, ${input.year_published},
          ${input.genre}::genre, ${input.subgenre},
          ${examBoardsLiteral}::exam_board[],
          ${input.difficulty}, ${input.reading_level},
          ${input.word_count}, ${themesLiteral}::text[], ${input.body},
          ${status}::content_status,
          ${status === "published" ? tx`NOW()` : null}
        )
        RETURNING ${tx.unsafe(SELECT_COLS)}
      `;
      if (!rows[0]) throw new Error("insert returned no row");
      return rowToPassage(rows[0]);
    });
  }

  async updateStatus(
    id: string,
    version: number,
    status: ContentStatus,
  ): Promise<Passage> {
    const rows = await this.sql<Row[]>`
      UPDATE passages
      SET status = ${status}::content_status,
          published_at = CASE
            WHEN ${status} = 'published' AND published_at IS NULL THEN NOW()
            ELSE published_at
          END
      WHERE id = ${id} AND version = ${version}
      RETURNING ${this.sql.unsafe(SELECT_COLS)}
    `;
    if (!rows[0]) {
      throw new Error(`passage not found: id=${id} version=${version}`);
    }
    return rowToPassage(rows[0]);
  }
}
