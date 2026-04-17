import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createPool } from "../../db/pool.js";
import { resetAndMigrate } from "./fixtures.js";
import { PostgresUserMappingRepository } from "./postgres-user-mapping-repository.js";
import { PostgresIngestJobRepository } from "./postgres-ingest-job-repository.js";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = typeof DATABASE_URL === "string" && DATABASE_URL.length > 0;
const d = hasDb ? describe : describe.skip;

d("PostgresIngestJobRepository", () => {
  let sql: postgres.Sql;
  let repo: PostgresIngestJobRepository;
  let adminUserId: number;

  beforeAll(async () => {
    sql = createPool({ connectionString: DATABASE_URL, max: 2 });
    await resetAndMigrate(sql);
    repo = new PostgresIngestJobRepository(sql);
    const users = new PostgresUserMappingRepository(sql);
    const admin = await users.getOrCreate("ingest-admin-sub");
    adminUserId = admin.id;
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("create inserts a job in pending status with zero counters", async () => {
    const job = await repo.create({
      passage_manifest_id: 1,
      triggered_by_user_id: adminUserId,
    });
    expect(job.status).toBe("pending");
    expect(job.questions_generated).toBe(0);
    expect(job.questions_failed).toBe(0);
    expect(job.completed_at).toBeNull();
  });

  it("findById returns the inserted job", async () => {
    const job = await repo.create({
      passage_manifest_id: 2,
      triggered_by_user_id: adminUserId,
    });
    const found = await repo.findById(job.id);
    expect(found?.id).toBe(job.id);
  });

  it("markRunning updates status to running", async () => {
    const job = await repo.create({
      passage_manifest_id: 3,
      triggered_by_user_id: adminUserId,
    });
    const running = await repo.markRunning(job.id);
    expect(running.status).toBe("running");
  });

  it("markFinished completed stamps completed_at and counters; preserves error_log (for partial failures)", async () => {
    const job = await repo.create({
      passage_manifest_id: 4,
      triggered_by_user_id: adminUserId,
    });
    await repo.markRunning(job.id);
    const done = await repo.markFinished(
      job.id,
      "completed",
      { questions_generated: 7, questions_failed: 1 },
      "partial: 1 question failed",
    );
    expect(done.status).toBe("completed");
    expect(done.questions_generated).toBe(7);
    expect(done.questions_failed).toBe(1);
    expect(done.completed_at).not.toBeNull();
    expect(done.error_log).toBe("partial: 1 question failed");
  });

  it("markFinished completed with no error_log leaves it null", async () => {
    const job = await repo.create({
      passage_manifest_id: 11,
      triggered_by_user_id: adminUserId,
    });
    await repo.markRunning(job.id);
    const done = await repo.markFinished(job.id, "completed", {
      questions_generated: 8,
      questions_failed: 0,
    });
    expect(done.status).toBe("completed");
    expect(done.error_log).toBeNull();
  });

  it("markFinished failed preserves error_log", async () => {
    const job = await repo.create({
      passage_manifest_id: 5,
      triggered_by_user_id: adminUserId,
    });
    const failed = await repo.markFinished(
      job.id,
      "failed",
      { questions_generated: 0, questions_failed: 8 },
      "Gutenberg returned 503",
    );
    expect(failed.status).toBe("failed");
    expect(failed.error_log).toBe("Gutenberg returned 503");
  });

  it("listRecent returns newest first", async () => {
    const first = await repo.create({
      passage_manifest_id: 10,
      triggered_by_user_id: adminUserId,
    });
    await new Promise((r) => setTimeout(r, 5));
    const second = await repo.create({
      passage_manifest_id: 11,
      triggered_by_user_id: adminUserId,
    });
    const list = await repo.listRecent(50, 0);
    const relevant = list.filter(
      (j) => j.id === first.id || j.id === second.id,
    );
    expect(relevant[0]!.id).toBe(second.id);
    expect(relevant[1]!.id).toBe(first.id);
  });

  it("findById returns null for unknown job", async () => {
    expect(
      await repo.findById("00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
  });

  it("markRunning throws for unknown job", async () => {
    await expect(
      repo.markRunning("00000000-0000-4000-8000-000000000000"),
    ).rejects.toThrow(/not found/);
  });
});
