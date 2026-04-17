import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { CoachError, type CoachService } from "../services/coach-service.js";

const ParamsSchema = z.object({
  sessionId: z.string().uuid(),
  attemptId: z.string().uuid(),
});

function getUserId(req: Request): number {
  if (!req.auth) {
    throw new Error(
      "coach router used without auth middleware — req.auth is not set",
    );
  }
  return req.auth.user_id;
}

/**
 * Walk-through endpoint. Rate-limited per authenticated user so a
 * student hammering the button can't spin up unbounded LLM spend.
 * 10/min is the ceiling from eng-review decision #12.
 */
export function createCoachRouter(svc: CoachService): Router {
  const router = Router();

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Scope the bucket to the authed user_id. If req.auth is missing
    // the request should already be 401 from upstream middleware, but
    // we use the IP as a last-resort fallback so rateLimit doesn't
    // throw.
    keyGenerator: (req) =>
      req.auth?.user_id != null ? `u:${req.auth.user_id}` : `ip:${req.ip}`,
    handler: (_req, res) => {
      res.status(429).json({
        error: "rate_limited",
        message: "Give us a moment. Try again in a little bit.",
      });
    },
  });

  router.post(
    "/sessions/:sessionId/attempts/:attemptId/walkthrough",
    limiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { sessionId, attemptId } = ParamsSchema.parse(req.params);
        const result = await svc.generateWalkthrough({
          session_id: sessionId,
          attempt_id: attemptId,
          user_id: getUserId(req),
        });
        res.json(result);
      } catch (err) {
        if (err instanceof CoachError) {
          res.status(err.http_status).json({
            error: err.code,
            message: err.message,
          });
          return;
        }
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

  return router;
}
