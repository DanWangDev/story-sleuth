import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { EXAM_BOARDS, QUESTION_TYPES } from "@story-sleuth/shared";
import type { ManifestLoader } from "../../content/manifest-loader.js";
import type { ContentPipeline } from "../../content/content-pipeline.js";
import type { IngestJobRepository } from "../../repositories/interfaces/ingest-job-repository.js";

const ManifestIdParam = z.object({
  manifest_id: z.coerce.number().int().positive(),
});

const JobIdParam = z.object({ job_id: z.string().uuid() });

const IngestBody = z
  .object({
    question_count: z.number().int().min(1).max(20).optional(),
    exam_board: z.enum(EXAM_BOARDS).optional(),
    question_types: z.array(z.enum(QUESTION_TYPES)).nonempty().optional(),
  })
  .strict();

function getAdminUserId(req: Request): number {
  if (!req.auth) {
    throw new Error("ingest router used without auth middleware");
  }
  return req.auth.user_id;
}

/**
 * Admin endpoints for triggering and monitoring content pipeline runs.
 *
 * The HTTP contract is async-shaped (202 + { job_id } on create, GET
 * endpoint to poll) even though Phase 1 does the work inline. Matches
 * eng-review decision #16: "Async contract on admin ingest endpoint …
 * Phase 1 implementation runs work inline; Phase 2+ swaps in BullMQ
 * without breaking the contract."
 */
export function createAdminIngestRouter(
  pipeline: ContentPipeline,
  jobs: IngestJobRepository,
  manifests: ManifestLoader,
): Router {
  const router = Router();

  // GET /api/admin/ingest/manifests — list manifests the admin can ingest.
  router.get("/manifests", async (_req, res, next) => {
    try {
      const list = await manifests.listAll();
      res.json({ manifests: list });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/admin/ingest/:manifest_id — trigger a pipeline run.
  router.post(
    "/:manifest_id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { manifest_id } = ManifestIdParam.parse(req.params);
        const body = IngestBody.parse(req.body ?? {});

        const result = await pipeline.run({
          manifest_id,
          triggered_by_user_id: getAdminUserId(req),
          question_count: body.question_count,
          exam_board: body.exam_board,
          question_types: body.question_types,
        });

        res.status(202).json({
          job: result.job,
          passage_id: result.passage?.id ?? null,
          passage_version: result.passage?.version ?? null,
        });
      } catch (err) {
        if (err instanceof z.ZodError) {
          res.status(400).json({
            error: "invalid_request",
            issues: err.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          });
          return;
        }
        next(err);
      }
    },
  );

  // GET /api/admin/ingest/jobs — recent runs for the admin dashboard.
  router.get("/jobs", async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
      const offset = Math.max(Number(req.query.offset ?? 0), 0);
      const list = await jobs.listRecent(limit, offset);
      res.json({ jobs: list });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/admin/ingest/jobs/:job_id — single job status (for polling).
  router.get(
    "/jobs/:job_id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { job_id } = JobIdParam.parse(req.params);
        const job = await jobs.findById(job_id);
        if (!job) {
          res.status(404).json({ error: "job_not_found" });
          return;
        }
        res.json({ job });
      } catch (err) {
        if (err instanceof z.ZodError) {
          res.status(400).json({ error: "invalid_request" });
          return;
        }
        next(err);
      }
    },
  );

  return router;
}
