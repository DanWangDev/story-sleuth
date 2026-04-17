import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createPool } from "../../db/pool.js";
import { passageCreateInput, resetAndMigrate } from "./fixtures.js";
import { PostgresPassageRepository } from "./postgres-passage-repository.js";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = typeof DATABASE_URL === "string" && DATABASE_URL.length > 0;
const d = hasDb ? describe : describe.skip;

d("PostgresPassageRepository", () => {
  let sql: postgres.Sql;
  let repo: PostgresPassageRepository;

  beforeAll(async () => {
    sql = createPool({ connectionString: DATABASE_URL, max: 2 });
    await resetAndMigrate(sql);
    repo = new PostgresPassageRepository(sql);
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("findById returns null when not found", async () => {
    expect(
      await repo.findById("00000000-0000-4000-8000-000000000000", 1),
    ).toBeNull();
  });

  it("create inserts a new passage at version 1 with draft status by default", async () => {
    const p = await repo.create(passageCreateInput({ title: "Brand new" }));
    expect(p.version).toBe(1);
    expect(p.status).toBe("draft");
    expect(p.published_at).toBeNull();
    expect(p.title).toBe("Brand new");
  });

  it("create with status=published stamps published_at", async () => {
    const p = await repo.create(
      passageCreateInput({ title: "Live", status: "published" }),
    );
    expect(p.status).toBe("published");
    expect(p.published_at).not.toBeNull();
  });

  it("findById returns the inserted row", async () => {
    const p = await repo.create(passageCreateInput({ title: "Findable" }));
    const back = await repo.findById(p.id, p.version);
    expect(back).not.toBeNull();
    expect(back?.id).toBe(p.id);
    expect(back?.title).toBe("Findable");
  });

  it("create with existing_id bumps version", async () => {
    const v1 = await repo.create(
      passageCreateInput({ title: "Re-ingest", status: "published" }),
    );
    const v2 = await repo.create(
      passageCreateInput({
        title: "Re-ingest v2",
        existing_id: v1.id,
        status: "published",
      }),
    );
    expect(v2.id).toBe(v1.id);
    expect(v2.version).toBe(2);

    const v3 = await repo.create(
      passageCreateInput({
        title: "Re-ingest v3",
        existing_id: v1.id,
      }),
    );
    expect(v3.version).toBe(3);
  });

  it("findLatestPublishedById returns the highest published version only", async () => {
    const v1 = await repo.create(
      passageCreateInput({ title: "Latest v1", status: "published" }),
    );
    await repo.create(
      passageCreateInput({
        title: "Latest v2 (draft)",
        existing_id: v1.id,
        status: "draft",
      }),
    );
    const found = await repo.findLatestPublishedById(v1.id);
    expect(found?.version).toBe(1);
    expect(found?.title).toBe("Latest v1");
  });

  it("listPublishedByExamBoard filters and dedupes to one row per id", async () => {
    const glOnly = await repo.create(
      passageCreateInput({
        title: "GL-only",
        exam_boards: ["GL"],
        status: "published",
      }),
    );
    await repo.create(
      passageCreateInput({
        title: "CEM-only",
        exam_boards: ["CEM"],
        status: "published",
      }),
    );
    await repo.create(
      passageCreateInput({
        title: "draft",
        exam_boards: ["GL"],
        status: "draft",
      }),
    );
    const list = await repo.listPublishedByExamBoard("GL", 50, 0);
    const ids = list.map((p) => p.id);
    expect(ids).toContain(glOnly.id);
    expect(list.every((p) => p.exam_boards.includes("GL"))).toBe(true);
    expect(list.every((p) => p.status === "published")).toBe(true);
  });

  it("listPendingReview returns only pending_review, newest first", async () => {
    const pend = await repo.create(
      passageCreateInput({ title: "Pending", status: "pending_review" }),
    );
    const list = await repo.listPendingReview(50, 0);
    expect(list.some((p) => p.id === pend.id)).toBe(true);
    expect(list.every((p) => p.status === "pending_review")).toBe(true);
  });

  it("updateStatus moves through lifecycle and stamps published_at on first publish", async () => {
    const p = await repo.create(passageCreateInput({ title: "Lifecycle" }));
    const reviewed = await repo.updateStatus(p.id, p.version, "pending_review");
    expect(reviewed.status).toBe("pending_review");
    expect(reviewed.published_at).toBeNull();

    const published = await repo.updateStatus(p.id, p.version, "published");
    expect(published.status).toBe("published");
    expect(published.published_at).not.toBeNull();
  });

  it("updateStatus throws when the passage does not exist", async () => {
    await expect(
      repo.updateStatus("00000000-0000-4000-8000-000000000000", 1, "published"),
    ).rejects.toThrow(/not found/);
  });
});
