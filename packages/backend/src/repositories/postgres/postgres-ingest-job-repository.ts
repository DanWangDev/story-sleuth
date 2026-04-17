import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type { IngestJob, IngestJobStatus } from "@story-sleuth/shared";
import type {
  IngestJobCreateInput,
  IngestJobRepository,
} from "../interfaces/ingest-job-repository.js";

type Row = {
  id: string;
  passage_manifest_id: number;
  triggered_by_user_id: string | number;
  status: IngestJobStatus;
  questions_generated: number;
  questions_failed: number;
  started_at: Date;
  completed_at: Date | null;
  error_log: string | null;
};

function rowToJob(r: Row): IngestJob {
  return {
    id: r.id,
    passage_manifest_id: r.passage_manifest_id,
    triggered_by_user_id: Number(r.triggered_by_user_id),
    status: r.status,
    questions_generated: r.questions_generated,
    questions_failed: r.questions_failed,
    started_at: r.started_at.toISOString(),
    completed_at: r.completed_at?.toISOString() ?? null,
    error_log: r.error_log,
  };
}

const SELECT_COLS = `
  id, passage_manifest_id, triggered_by_user_id, status,
  questions_generated, questions_failed, started_at, completed_at,
  error_log
`;

export class PostgresIngestJobRepository implements IngestJobRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async findById(id: string): Promise<IngestJob | null> {
    const rows = await this.sql<Row[]>`
      SELECT ${this.sql.unsafe(SELECT_COLS)}
      FROM ingest_jobs WHERE id = ${id}
    `;
    return rows[0] ? rowToJob(rows[0]) : null;
  }

  async listRecent(limit: number, offset: number): Promise<IngestJob[]> {
    const rows = await this.sql<Row[]>`
      SELECT ${this.sql.unsafe(SELECT_COLS)}
      FROM ingest_jobs
      ORDER BY started_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return rows.map(rowToJob);
  }

  async create(input: IngestJobCreateInput): Promise<IngestJob> {
    const id = randomUUID();
    const rows = await this.sql<Row[]>`
      INSERT INTO ingest_jobs (
        id, passage_manifest_id, triggered_by_user_id, status,
        questions_generated, questions_failed
      ) VALUES (
        ${id}, ${input.passage_manifest_id}, ${input.triggered_by_user_id},
        'pending'::ingest_job_status, 0, 0
      )
      RETURNING ${this.sql.unsafe(SELECT_COLS)}
    `;
    if (!rows[0]) throw new Error("insert returned no row");
    return rowToJob(rows[0]);
  }

  async markRunning(id: string): Promise<IngestJob> {
    const rows = await this.sql<Row[]>`
      UPDATE ingest_jobs
      SET status = 'running'::ingest_job_status,
          started_at = NOW()
      WHERE id = ${id}
      RETURNING ${this.sql.unsafe(SELECT_COLS)}
    `;
    if (!rows[0]) throw new Error(`ingest job not found: ${id}`);
    return rowToJob(rows[0]);
  }

  async markFinished(
    id: string,
    status: Extract<IngestJobStatus, "completed" | "failed">,
    counters: { questions_generated: number; questions_failed: number },
    error_log?: string,
  ): Promise<IngestJob> {
    const rows = await this.sql<Row[]>`
      UPDATE ingest_jobs
      SET status = ${status}::ingest_job_status,
          questions_generated = ${counters.questions_generated},
          questions_failed = ${counters.questions_failed},
          completed_at = NOW(),
          error_log = ${status === "failed" ? (error_log ?? null) : null}
      WHERE id = ${id}
      RETURNING ${this.sql.unsafe(SELECT_COLS)}
    `;
    if (!rows[0]) throw new Error(`ingest job not found: ${id}`);
    return rowToJob(rows[0]);
  }
}
