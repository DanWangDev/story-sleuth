import dotenv from "dotenv";
import { loadEnv } from "./config/env.js";
import { createApp } from "./app.js";
import { createPool } from "./db/pool.js";

dotenv.config();

const SERVICE_NAME = "story-sleuth-backend";
const env = loadEnv();
const sql = createPool();
const app = createApp({ env, sql });

const server = app.listen(env.PORT, () => {
  console.log(`[${SERVICE_NAME}] listening on :${env.PORT}`);
});

function shutdown(): void {
  console.log(`[${SERVICE_NAME}] shutting down...`);
  server.close(() => {
    sql.end({ timeout: 5 }).finally(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
