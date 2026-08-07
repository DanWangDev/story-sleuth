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

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = typeof DATABASE_URL === "string" && DATABASE_URL.length > 0;
const d = hasDb ? describe : describe.skip;

// Body text for the test passage (no extract phrases, no fetching).
const SAMPLE_BODY = [
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

const SAMPLE_WORD_COUNT = SAMPLE_BODY.split(/\s+/).filter((w) => w.length > 0).length;

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
    buildClientSpy = vi.spyOn(factory, "buildClient");
  });

  function makePipeline(client: ILLMClient): ContentPipeline {
    const pipeline = new ContentPipeline(
      manifests,
      passages,
      questions,
      jobs,
      factory,
    );
    buildClientSpy.mockResolvedValue(client);
    return pipeline;
  }

  it("runs the full pipeline: body → passage insert → generate → questions insert → job completed", async () => {
    const client = makeFakeClient(validQuestion());
    const pipeline = makePipeline(client);

    const result = await pipeline.run({
      manifest_id: 42,
      triggered_by_user_id: adminId,
      body: SAMPLE_BODY,
      word_count: SAMPLE_WORD_COUNT,
      question_count: 2,
      question_types: ["inference"],
    });

    // Job is marked completed with counters.
    expect(result.job.status).toBe("completed");
    expect(result.job.questions_generated).toBe(2);
    expect(result.job.questions_failed).toBe(0);
    expect(result.job.completed_at).not.toBeNull();

    // Passage was created as pending_review.
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
    const pipeline = makePipeline(client);

    const result = await pipeline.run({
      manifest_id: 999,
      triggered_by_user_id: adminId,
      body: SAMPLE_BODY,
      word_count: SAMPLE_WORD_COUNT,
    });

    expect(result.job.status).toBe("failed");
    expect(result.job.error_log).toMatch(/no manifest with id=999/);
    expect(result.passage).toBeNull();
  });

  it("marks the job as failed with a clear reason when LLM is unavailable", async () => {
    const client = makeFakeClient(validQuestion());
    const pipeline = makePipeline(client);
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
      body: SAMPLE_BODY,
      word_count: SAMPLE_WORD_COUNT,
    });
    expect(result.job.status).toBe("failed");
    const freshPassage = await passages.findLatestPublishedById(
      (await passages.listPendingReview(100, 0))[0]?.id ?? "none",
    );
    expect(freshPassage).toBeNull();
  });

  it("records partial failures: some questions fail generation but others succeed", async () => {
    let i = 0;
    const responses = [
      "bad", "also bad", "still bad", // first question: 3 bad → gives up
      validQuestion(),                // second question: good
    ];
    const client: ILLMClient = {
      provider: "qwen",
      model: "test-model",
      generate: vi.fn(async () => ({
        text: responses[i++] ?? validQuestion(),
        model: "test-model",
      })),
    };
    const pipeline = makePipeline(client);

    const result = await pipeline.run({
      manifest_id: 42,
      triggered_by_user_id: adminId,
      body: SAMPLE_BODY,
      word_count: SAMPLE_WORD_COUNT,
      question_count: 2,
      question_types: ["inference"],
    });

    expect(result.job.status).toBe("completed");
    expect(result.job.questions_generated).toBe(1);
    expect(result.job.questions_failed).toBe(1);
    expect(result.job.error_log).toMatch(/partial/);
  });
});
