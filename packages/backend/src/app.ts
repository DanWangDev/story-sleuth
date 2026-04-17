import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createHealthRouter } from "./routes/health.js";

/**
 * Build the Express application. Importing this module has zero side
 * effects — no server listen, no DB connection — so tests can construct
 * app instances cheaply without mocking a network layer.
 */
export function createApp(): express.Express {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5180" }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", createHealthRouter());
  return app;
}
