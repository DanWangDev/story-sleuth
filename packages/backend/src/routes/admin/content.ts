import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { ContentStatusSchema } from "@story-sleuth/shared";
import type { PassageRepository } from "../../repositories/interfaces/passage-repository.js";
import type { QuestionRepository } from "../../repositories/interfaces/question-repository.js";

const QuestionIdParam = z.object({ id: z.string().uuid() });
const PassageKeyParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const StatusBody = z.object({ status: ContentStatusSchema });

/**
 * Admin review + publish workflow.
 *
 * Ingest leaves everything as `pending_review`. Admin browses queues,
 * clicks Publish on each item they approve. Publish is a hard gate
 * before any student session can surface the content.
 *
 * Questions are updatable only via status transitions here — edit is
 * not offered in Phase 1 (admin can Regenerate via a fresh ingest if
 * a question is off). Matches the design doc's "minimal v1 admin
 * workflow" scope.
 */
export function createAdminContentRouter(
  passages: PassageRepository,
  questions: QuestionRepository,
): Router {
  const router = Router();

  // -- Passage review queue + publish -----------------------------------

  router.get("/passages/pending", async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
      const offset = Math.max(Number(req.query.offset ?? 0), 0);
      const list = await passages.listPendingReview(limit, offset);
      res.json({ passages: list });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/passages/:id/:version/status",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id, version } = PassageKeyParams.parse(req.params);
        const { status } = StatusBody.parse(req.body ?? {});
        const updated = await passages.updateStatus(id, version, status);
        res.json({ passage: updated });
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
        if (err instanceof Error && err.message.includes("not found")) {
          res.status(404).json({ error: "passage_not_found" });
          return;
        }
        next(err);
      }
    },
  );

  // -- Question review queue + publish ----------------------------------

  router.get("/questions/pending", async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
      const offset = Math.max(Number(req.query.offset ?? 0), 0);
      const list = await questions.listPendingReview(limit, offset);
      res.json({ questions: list });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/questions/by-passage/:id/:version",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id, version } = PassageKeyParams.parse(req.params);
        const list = await questions.findByPassage(id, version);
        res.json({ questions: list });
      } catch (err) {
        if (err instanceof z.ZodError) {
          res.status(400).json({ error: "invalid_request" });
          return;
        }
        next(err);
      }
    },
  );

  router.post(
    "/questions/:id/status",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = QuestionIdParam.parse(req.params);
        const { status } = StatusBody.parse(req.body ?? {});
        const updated = await questions.updateStatus(id, status);
        res.json({ question: updated });
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
        if (err instanceof Error && err.message.includes("not found")) {
          res.status(404).json({ error: "question_not_found" });
          return;
        }
        next(err);
      }
    },
  );

  return router;
}
