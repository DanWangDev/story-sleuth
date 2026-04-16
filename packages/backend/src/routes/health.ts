import { Router } from "express";

export function createHealthRouter(): Router {
  const router = Router();
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "story-sleuth-backend", timestamp: new Date().toISOString() });
  });
  return router;
}
