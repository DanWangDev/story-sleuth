import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { createPool } from "../db/pool.js";
import { SecretCrypto } from "../crypto/secret-crypto.js";
import { resetAndMigrate } from "../repositories/postgres/fixtures.js";
import { PostgresPassageRepository } from "../repositories/postgres/postgres-passage-repository.js";
import { PostgresQuestionRepository } from "../repositories/postgres/postgres-question-repository.js";
import { PostgresIngestJobRepository } from "../repositories/postgres/postgres-ingest-job-repository.js";
import { PostgresUserMappingRepository } from "../repositories/postgres/postgres-user-mapping-repository.js";
import { PostgresAdminSettingsRepository } from "../repositories/postgres/postgres-admin-settings-repository.js";
import { LLMFactory } from "../llm/factory.js";
import type { ILLMClient } from "../llm/types.js";
import { ManifestLoader } from "./manifest-loader.js";
import { ContentPipeline } from "./content-pipeline.js";
import { PassageFetcher } from "./passage-fetcher.js";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = typeof DATABASE_URL === "string" && DATABASE_URL.length > 0;
const d = hasDb ? describe : describe.skip;

const SAMPLE_SOURCE = [
  "Chapter I.",
  "",
  "The Mole had been working very hard all the morning, spring-cleaning",
  "his little home. First with brooms, then with dusters; then on ladders",
  "and steps and chairs, with a brush and a pail of whitewash; till he had",
  "dust in his throat and eyes, and splashes of whitewash all over his",
  "black fur, and an aching back and weary arms. Spring was moving in the",
  "air above and in the earth below and around him, penetrating even his",
  "dark and lowly little house with its spirit of divine discontent and",
  "longing. It was small wonder, then, that he suddenly flung down his",
  "brush on the floor and bolted out of the house without even waiting to put on his coat.",
].join("\n");

const MANIFEST_YAML = [
  "---",
  "id: 42",
  'title: "Test Wind in the Willows"',
  'author: "Kenneth Grahame"',
  'source: "Project Gutenberg #289"',
  'source_url: "https://example.test/289-0.txt"',
  "year_published: 1908",
  'genre: "fiction"',
  'subgenre: "classic"',
  "difficulty: 2",
  'exam_boards: ["GL"]',
  "word_count_target: 90",
  'reading_level: "Year 5-6"',
  'themes: ["nature"]',
  "question_types_suitable:",
  "  - inference",
  "  - retrieval",
  "extract:",
  '  start_phrase: "The Mole had been working very hard"',
  '  end_phrase: "without even waiting to put on his coat."',
  "  approximate_words: 90",
  "---",
  "",
].join("\n");

function makeFakeClient(responseJson: string): ILLMClient {
  return {
    provider: "qwen",
    model: "test-model",
    generate: vi.fn(async () => ({ text: responseJson, model: "test-model" })),
  };
}

const validQuestion = (letter: "A" | "B" | "C" | "D" = "B"): string =>
  JSON.stringify({
    text: "Why does Mole stop cleaning?",
    question_type: "inference",
    exam_boards: ["GL"],
    difficulty: 2,
    options: [
      { letter: "A", text: "he finished", explanation_if_chosen: "not quite" },
      { letter: "B", text: "spring called him", explanation_if_chosen: "right" },
      { letter: "C", text: "he was angry", explanation_if_chosen: "no" },
      { letter: "D", text: "he was tired", explanation_if_chosen: "partial" },
    ],
    correct_option: letter,
  });

d("ContentPipeline (integration)", () => {
  let sql: postgres.Sql;
  let contentDir: string;
  let manifests: ManifestLoader;
  let passages: PostgresPassageRepository;
  let questions: PostgresQuestionRepository;
  let jobs: PostgresIngestJobRepository;
  let factory: LLMFactory;
  let fakeFetch: ReturnType<typeof vi.fn>;
  let buildClientSpy: ReturnType<typeof vi.spyOn>;
  let adminId: number;

  beforeAll(async () => {
    sql = createPool({ connectionString: DATABASE_URL, max: 2 });
    await resetAndMigrate(sql);

    contentDir = path.join(tmpdir(), `content-pipeline-${Date.now()}`);
    await mkdir(contentDir, { recursive: true });
    await writeFile(path.join(contentDir, "042.md"), MANIFEST_YAML);

    manifests = new ManifestLoader(contentDir);
    passages = new PostgresPassageRepository(sql);
    questions = new PostgresQuestionRepository(sql);
    jobs = new PostgresIngestJobRepository(sql);

    const crypto = new SecretCrypto(randomBytes(32));
    const settings = new PostgresAdminSettingsRepository(sql, crypto);
    factory = new LLMFactory(settings);

    const users = new PostgresUserMappingRepository(sql);
    adminId = (await users.getOrCreate(`pipeline-admin-${Math.random()}`)).id;
  });

  afterAll(async () => {
    await rm(contentDir, { recursive: true, force: true });
    await sql.end({ timeout: 5 });
  });

  beforeEach(() => {
    fakeFetch = vi.fn(
      async () => new Response(SAMPLE_SOURCE, { status: 200 }),
    );
    // Fresh spy on the factory per test — buildClientSpy.mockResolvedValue
    // lets each test hand back its own client with a distinct
    // generate() implementation.
    buildClientSpy = vi.spyOn(factory, "buildClient");
  });

  function makePipelineWithFakeFetch(client: ILLMClient): ContentPipeline {
    const pipeline = new ContentPipeline(
      manifests,
      passages,
      questions,
      jobs,
      factory,
    );
    // Inject fake fetch into the fetcher this pipeline instance owns.
    // The fetcher field is private; tests reach in via `any` since this
    // is the only clean seam and keeps PassageFetcher's API narrow.
    (pipeline as unknown as { fetcher: PassageFetcher }).fetcher =
      new PassageFetcher(10_000, fakeFetch as unknown as typeof fetch);
    buildClientSpy.mockResolvedValue(client);
    return pipeline;
  }

  it("runs the full pipeline end-to-end: fetch → passage insert → generate → questions insert → job completed", async () => {
    const client = makeFakeClient(validQuestion());
    const pipeline = makePipelineWithFakeFetch(client);

    const result = await pipeline.run({
      manifest_id: 42,
      triggered_by_user_id: adminId,
      question_count: 2,
      question_types: ["inference"],
    });

    // Job is marked completed with counters.
    expect(result.job.status).toBe("completed");
    expect(result.job.questions_generated).toBe(2);
    expect(result.job.questions_failed).toBe(0);
    expect(result.job.completed_at).not.toBeNull();

    // Passage was created as pending_review — never straight to published.
    expect(result.passage).not.toBeNull();
    expect(result.passage!.status).toBe("pending_review");
    expect(result.passage!.title).toBe("Test Wind in the Willows");
    expect(result.passage!.body).toMatch(/The Mole had been working very hard/);

    // Questions were inserted as pending_review.
    const q = await questions.findByPassage(
      result.passage!.id,
      result.passage!.version,
    );
    expect(q).toHaveLength(2);
    expect(q.every((x) => x.status === "pending_review")).toBe(true);
    expect(q.every((x) => x.exam_boards.includes("GL"))).toBe(true);
  });

  it("marks the job as failed when the manifest is missing", async () => {
    const client = makeFakeClient(validQuestion());
    const pipeline = makePipelineWithFakeFetch(client);

    const result = await pipeline.run({
      manifest_id: 999,
      triggered_by_user_id: adminId,
    });

    expect(result.job.status).toBe("failed");
    expect(result.job.error_log).toMatch(/no manifest with id=999/);
    expect(result.passage).toBeNull();
  });

  it("marks the job as failed when the source URL returns 404", async () => {
    const client = makeFakeClient(validQuestion());
    fakeFetch = vi.fn(async () => new Response(null, { status: 404 }));
    const pipeline = makePipelineWithFakeFetch(client);

    const result = await pipeline.run({
      manifest_id: 42,
      triggered_by_user_id: adminId,
    });
    expect(result.job.status).toBe("failed");
    expect(result.job.error_log).toMatch(/HTTP 404|http_error/);
    expect(result.passage).toBeNull();
  });

  it("marks the job as failed with a clear reason when LLM is unavailable", async () => {
    const client = makeFakeClient(validQuestion());
    const pipeline = makePipelineWithFakeFetch(client);
    // Force the factory to error.
    buildClientSpy.mockRejectedValueOnce(
      Object.assign(new Error("no provider"), {
        name: "LLMError",
        code: "provider_unknown",
        provider: "unknown",
        retryable: false,
      }),
    );

    const result = await pipeline.run({
      manifest_id: 42,
      triggered_by_user_id: adminId,
    });
    // The passage was still inserted (step 4) before the LLM failure in
    // step 5 — we don't half-undo. The job reflects the failure.
    expect(result.job.status).toBe("failed");
    // The passage row exists in DB (not ideal but acceptable — admin
    // can archive it). Verify NOT published.
    const freshPassage = await passages.findLatestPublishedById(
      (await passages.listPendingReview(100, 0))[0]?.id ?? "none",
    );
    expect(freshPassage).toBeNull();
  });

  it("records partial failures: some questions fail generation but others succeed", async () => {
    // Alternate bad/good responses — generator takes 3 attempts per
    // failing question (initial + 2 retries) before giving up.
    let i = 0;
    const responses = [
      // First question: 3 bad → gives up.
      "bad",
      "also bad",
      "still bad",
      // Second question: good on first try.
      validQuestion(),
    ];
    const client: ILLMClient = {
      provider: "qwen",
      model: "test-model",
      generate: vi.fn(async () => ({
        text: responses[i++] ?? validQuestion(),
        model: "test-model",
      })),
    };
    const pipeline = makePipelineWithFakeFetch(client);

    const result = await pipeline.run({
      manifest_id: 42,
      triggered_by_user_id: adminId,
      question_count: 2,
      question_types: ["inference"],
    });

    expect(result.job.status).toBe("completed");
    expect(result.job.questions_generated).toBe(1);
    expect(result.job.questions_failed).toBe(1);
    expect(result.job.error_log).toMatch(/partial/);
  });
});
