import type { IngestJob, IngestJobStatus } from "@story-sleuth/shared";

export interface IngestJobCreateInput {
  passage_manifest_id: number;
  triggered_by_user_id: number;
}

export interface IngestJobRepository {
  findById(id: string): Promise<IngestJob | null>;

  /** Admin ingest-jobs page, newest first. */
  listRecent(limit: number, offset: number): Promise<IngestJob[]>;

  /** Create in 'pending' status. */
  create(input: IngestJobCreateInput): Promise<IngestJob>;

  /** Mark a job as running (stamps a new started_at). */
  markRunning(id: string): Promise<IngestJob>;

  /** Mark a job completed or failed. `error_log` only honoured on failed. */
  markFinished(
    id: string,
    status: Extract<IngestJobStatus, "completed" | "failed">,
    counters: { questions_generated: number; questions_failed: number },
    error_log?: string,
  ): Promise<IngestJob>;
}
