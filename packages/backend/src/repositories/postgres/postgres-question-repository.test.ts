import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createPool } from "../../db/pool.js";
import {
  passageCreateInput,
  questionCreateInput,
  resetAndMigrate,
  validOption,
} from "./fixtures.js";
import { PostgresPassageRepository } from "./postgres-passage-repository.js";
import { PostgresQuestionRepository } from "./postgres-question-repository.js";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = typeof DATABASE_URL === "string" && DATABASE_URL.length > 0;
const d = hasDb ? describe : describe.skip;

d("PostgresQuestionRepository", () => {
  let sql: postgres.Sql;
  let passages: PostgresPassageRepository;
  let repo: PostgresQuestionRepository;

  beforeAll(async () => {
    sql = createPool({ connectionString: DATABASE_URL, max: 2 });
    await resetAndMigrate(sql);
    passages = new PostgresPassageRepository(sql);
    repo = new PostgresQuestionRepository(sql);
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  async function newPassage(): Promise<{ id: string; version: number }> {
    const p = await passages.create(
      passageCreateInput({ status: "published" }),
    );
    return { id: p.id, version: p.version };
  }

  it("findById returns null when not found", async () => {
    expect(
      await repo.findById("00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
  });

  it("createMany inserts in a transaction and returns all rows", async () => {
    const { id: pid, version } = await newPassage();
    const qs = await repo.createMany([
      questionCreateInput(pid, version, { text: "Q1" }),
      questionCreateInput(pid, version, { text: "Q2" }),
    ]);
    expect(qs).toHaveLength(2);
    expect(qs[0]?.text).toBe("Q1");
    expect(qs[1]?.text).toBe("Q2");
    expect(qs.every((q) => q.status === "draft")).toBe(true);
  });

  it("createMany with status=published stamps published_at", async () => {
    const { id: pid, version } = await newPassage();
    const qs = await repo.createMany([
      questionCreateInput(pid, version, { status: "published" }),
    ]);
    expect(qs[0]?.status).toBe("published");
    expect(qs[0]?.published_at).not.toBeNull();
  });

  it("findByPassage with status filter returns only matching rows", async () => {
    const { id: pid, version } = await newPassage();
    await repo.createMany([
      questionCreateInput(pid, version, { text: "draft-q" }),
      questionCreateInput(pid, version, {
        text: "pub-q",
        status: "published",
      }),
    ]);
    const published = await repo.findByPassage(pid, version, "published");
    expect(published.map((q) => q.text)).toEqual(["pub-q"]);

    const drafts = await repo.findByPassage(pid, version, "draft");
    expect(drafts.map((q) => q.text)).toEqual(["draft-q"]);
  });

  it("findByPassage without status filter returns all rows", async () => {
    const { id: pid, version } = await newPassage();
    await repo.createMany([
      questionCreateInput(pid, version),
      questionCreateInput(pid, version, { status: "published" }),
    ]);
    const all = await repo.findByPassage(pid, version);
    expect(all).toHaveLength(2);
  });

  it("findBySessionQuestionIds preserves caller ordering", async () => {
    const { id: pid, version } = await newPassage();
    const qs = await repo.createMany([
      questionCreateInput(pid, version, { text: "A" }),
      questionCreateInput(pid, version, { text: "B" }),
      questionCreateInput(pid, version, { text: "C" }),
    ]);
    const reordered = [qs[2]!.id, qs[0]!.id, qs[1]!.id];
    const found = await repo.findBySessionQuestionIds(reordered);
    expect(found.map((q) => q.text)).toEqual(["C", "A", "B"]);
  });

  it("findBySessionQuestionIds returns [] for empty input", async () => {
    expect(await repo.findBySessionQuestionIds([])).toEqual([]);
  });

  it("listPendingReview returns oldest pending first", async () => {
    const { id: pid, version } = await newPassage();
    const first = await repo.createMany([
      questionCreateInput(pid, version, {
        text: "older pending",
        status: "pending_review",
      }),
    ]);
    // Force a distinct created_at so the ordering is observable.
    await new Promise((r) => setTimeout(r, 5));
    const second = await repo.createMany([
      questionCreateInput(pid, version, {
        text: "newer pending",
        status: "pending_review",
      }),
    ]);

    const pending = await repo.listPendingReview(50, 0);
    const relevantOrder = pending
      .filter((q) => q.id === first[0]!.id || q.id === second[0]!.id)
      .map((q) => q.id);
    expect(relevantOrder).toEqual([first[0]!.id, second[0]!.id]);
  });

  it("CHECK constraint rejects options with wrong letter set at the schema boundary", async () => {
    // Zod refuses duplicate letters at the app layer, but the question
    // repo accepts raw QuestionOption. This test confirms the Postgres
    // CHECK (length = 4) and FK constraints still fire for malformed
    // inputs that bypass Zod.
    const { id: pid, version } = await newPassage();
    await expect(
      repo.createMany([
        {
          passage_id: pid,
          passage_version: version,
          text: "Q",
          question_type: "inference",
          exam_boards: ["GL"],
          difficulty: 2,
          options: [validOption("A"), validOption("B"), validOption("C")],
          correct_option: "A",
        },
      ]),
    ).rejects.toThrow();
  });

  it("updateStatus transitions draft → published and stamps published_at", async () => {
    const { id: pid, version } = await newPassage();
    const [q] = await repo.createMany([questionCreateInput(pid, version)]);
    const pub = await repo.updateStatus(q!.id, "published");
    expect(pub.status).toBe("published");
    expect(pub.published_at).not.toBeNull();
  });
});
