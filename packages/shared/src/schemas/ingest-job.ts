import { z } from "zod";
import { IngestJobStatusSchema } from "../enums.js";

/**
 * One row per admin-triggered content pipeline run. The design contract is
 * async from day one: `POST /admin/ingest/:passage_manifest_id` returns
 * 202 + { job_id }; the admin polls `GET /admin/ingest/:job_id` for
 * progress. Phase 1 implementation runs work synchronously inline, but
 * the endpoint contract lets Phase 2 drop in a real queue (BullMQ) without
 * breaking clients.
 */
export const IngestJobSchema = z.object({
  id: z.string().uuid(),

  passage_manifest_id: z.number().int().positive(),
  triggered_by_user_id: z.number().int().positive(),

  status: IngestJobStatusSchema,

  /** Progress counters (populated as generation completes). */
  questions_generated: z.number().int().nonnegative(),
  questions_failed: z.number().int().nonnegative(),

  started_at: z.string().datetime(),
  completed_at: z.string().datetime().nullable(),

  /** Aggregated error messages from failed generations, for admin review. */
  error_log: z.string().nullable(),
});

export type IngestJob = z.infer<typeof IngestJobSchema>;
