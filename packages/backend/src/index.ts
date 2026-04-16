import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { createHealthRouter } from "./routes/health.js";

dotenv.config();

const SERVICE_NAME = "story-sleuth-backend";
const PORT = Number(process.env.PORT ?? 5060);

export function createApp(): express.Express {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5180" }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", createHealthRouter());
  return app;
}

function start(): void {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
  });
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  start();
}
