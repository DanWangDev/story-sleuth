import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import {
  ExamBoardSchema,
  OptionLetterSchema,
  SessionModeSchema,
} from "@story-sleuth/shared";
import { SessionError, type SessionService } from "../services/session-service.js";

const CreateSessionBodySchema = z.object({
  mode: SessionModeSchema,
  exam_board: ExamBoardSchema,
  passage_id: z.string().uuid().optional(),
  time_allowed_seconds: z.number().int().positive().optional(),
});

const SubmitAnswerBodySchema = z.object({
  question_id: z.string().uuid(),
  selected_letter: OptionLetterSchema,
  time_taken_ms: z.number().int().nonnegative(),
});

const SessionIdParamsSchema = z.object({ id: z.string().uuid() });

/**
 * Pull the authenticated user's local id. Route-level assertion —
 * the auth middleware is expected to have set req.auth BEFORE any
 * handler in this router runs. If it's missing, we're mounted wrong.
 */
function getUserId(req: Request): number {
  if (!req.auth) {
    throw new Error(
      "sessions router used without auth middleware — req.auth is not set",
    );
  }
  return req.auth.user_id;
}

export function createSessionsRouter(svc: SessionService): Router {
  const router = Router();

  // POST /api/sessions
  router.post("/", async (req, res, next) => {
    try {
      const body = CreateSessionBodySchema.parse(req.body);
      const payload = await svc.createSession({
        user_id: getUserId(req),
        mode: body.mode,
        exam_board: body.exam_board,
        passage_id: body.passage_id,
        time_allowed_seconds: body.time_allowed_seconds,
      });
      res.status(201).json(payload);
    } catch (err) {
      handleError(err, res, next);
    }
  });

  // GET /api/sessions/in-progress — landing page resume card
  // Registered BEFORE /:id so the literal route wins.
  router.get("/in-progress", async (req, res, next) => {
    try {
      const sessions = await svc.listInProgressForUser(getUserId(req));
      res.json({ sessions });
    } catch (err) {
      handleError(err, res, next);
    }
  });

  // GET /api/sessions/:id
  router.get("/:id", async (req, res, next) => {
    try {
      const { id } = SessionIdParamsSchema.parse(req.params);
      const payload = await svc.loadSession(id, getUserId(req));
      res.json(payload);
    } catch (err) {
      handleError(err, res, next);
    }
  });

  // POST /api/sessions/:id/answers
  router.post("/:id/answers", async (req, res, next) => {
    try {
      const { id } = SessionIdParamsSchema.parse(req.params);
      const body = SubmitAnswerBodySchema.parse(req.body);
      const result = await svc.submitAnswer({
        session_id: id,
        user_id: getUserId(req),
        question_id: body.question_id,
        selected_letter: body.selected_letter,
        time_taken_ms: body.time_taken_ms,
      });
      res.json(result);
    } catch (err) {
      handleError(err, res, next);
    }
  });

  // POST /api/sessions/:id/end
  router.post("/:id/end", async (req, res, next) => {
    try {
      const { id } = SessionIdParamsSchema.parse(req.params);
      const results = await svc.endSession(id, getUserId(req));
      res.json(results);
    } catch (err) {
      handleError(err, res, next);
    }
  });

  return router;
}

function handleError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof SessionError) {
    res.status(err.http_status).json({ error: err.code, message: err.message });
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
