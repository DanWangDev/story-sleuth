import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { StudentAttemptRepository } from "../repositories/interfaces/student-attempt-repository.js";
import type { UserMappingRepository } from "../repositories/interfaces/user-mapping-repository.js";

const HubUserIdParam = z.object({ hubUserId: z.string().min(1).max(200) });

/**
 * Service-to-service stats endpoint. 11plus-hub calls this via the
 * service-JWT middleware to fetch a user's reading comprehension
 * rollup for its parent dashboard.
 *
 * `hubUserId` is the OIDC `sub` from the hub — story-sleuth's own user
 * IDs are opaque internal FKs. If a hub user has never opened
 * story-sleuth there is no local mapping; return empty counters so
 * the hub's dashboard can render "no activity yet" without a
 * special-case 404.
 */
export function createStatsRouter(
  userMappings: UserMappingRepository,
  attempts: StudentAttemptRepository,
): Router {
  const router = Router();

  router.get(
    "/:hubUserId",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { hubUserId } = HubUserIdParam.parse(req.params);
        const mapping = await userMappings.findByHubUserId(hubUserId);
        if (!mapping) {
          res.json(emptyStats(hubUserId));
          return;
        }
        const summary = await attempts.getUserStatsSummary(mapping.id);
        res.json({ hub_user_id: hubUserId, app: "reading", ...summary });
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

function emptyStats(hubUserId: string): {
  hub_user_id: string;
  app: "reading";
  questions_answered: number;
  questions_correct: number;
  overall_accuracy: number;
  sessions_completed: number;
  by_exam_board: [];
  by_question_type: [];
  by_difficulty: [];
  last_attempt_at: null;
} {
  return {
    hub_user_id: hubUserId,
    app: "reading",
    questions_answered: 0,
    questions_correct: 0,
    overall_accuracy: 0,
    sessions_completed: 0,
    by_exam_board: [],
    by_question_type: [],
    by_difficulty: [],
    last_attempt_at: null,
  };
}
