#!/usr/bin/env node
/**
 * Post-build step: copy the non-TypeScript migration files into dist/.
 * tsc only emits .js/.d.ts — SQL files are left behind without this.
 */
import { mkdir, readdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, "..");

const SRC = path.join(BACKEND_ROOT, "src", "db", "migrations");
const DEST = path.join(BACKEND_ROOT, "dist", "db", "migrations");

await mkdir(DEST, { recursive: true });
const entries = await readdir(SRC);
let copied = 0;
for (const name of entries) {
  if (!name.endsWith(".sql")) continue;
  await copyFile(path.join(SRC, name), path.join(DEST, name));
  copied += 1;
}
console.log(`[copy-migrations] copied ${copied} .sql file(s) to dist/db/migrations/`);
