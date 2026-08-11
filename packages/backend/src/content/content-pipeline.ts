import type {
  ExamBoard,
  IngestJob,
  Passage,
  PassageManifest,
  QuestionType,
} from "@story-sleuth/shared";
import type { PassageRepository } from "../repositories/interfaces/passage-repository.js";
import type { QuestionRepository } from "../repositories/interfaces/question-repository.js";
import type { IngestJobRepository } from "../repositories/interfaces/ingest-job-repository.js";
import type { LLMFactory } from "../llm/factory.js";
import { LLMError } from "../llm/types.js";
import { QuestionGenerator, GeneratorError } from "./question-generator.js";
import { ManifestError, type ManifestLoader } from "./manifest-loader.js";

export class PipelineError extends Error {
  constructor(
    message: string,
    readonly code:
      | "manifest_error"
      | "llm_unavailable"
      | "generator_error",
  ) {
    super(message);
    this.name = "PipelineError";
  }
}

export interface PipelineResult {
  job: IngestJob;
  passage: Passage | null;
}

/**
 * Orchestrates one content ingestion: manifest → passage fetch →
 * question generation → DB inserts. Runs synchronously on the calling
 * thread (Phase 1 — matches eng-review's "async contract, sync
 * implementation" scope). The admin endpoint returns 202 + job_id as
 * soon as the job row exists; the actual work completes before the
 * HTTP response, but the CONTRACT accommodates a later BullMQ swap.
 *
 * Never writes published content. Everything lands as `pending_review`
 * so the admin explicitly approves before students see it.
 */
export class ContentPipeline {
  constructor(
    private readonly manifests: ManifestLoader,
    private readonly passages: PassageRepository,
    private readonly questions: QuestionRepository,
    private readonly jobs: IngestJobRepository,
    private readonly llmFactory: LLMFactory,
  ) {}

  async run(input: {
    manifest_id: number;
    triggered_by_user_id: number;
    /** Passage body text (from content adapter or manifest). Required. */
    body: string;
    /** Passage word count. Required. */
    word_count: number;
    /** Override how many questions to generate (default 8). */
    question_count?: number;
    /** Override which exam board to target (default: first board in manifest). */
    exam_board?: ExamBoard;
    /** Override the question-type mix. Default: every type from the manifest. */
    question_types?: QuestionType[];
  }): Promise<PipelineResult> {
    // Step 1: create job row FIRST so the admin has a handle even if
    // everything below fails.
    const job = await this.jobs.create({
      passage_manifest_id: input.manifest_id,
      triggered_by_user_id: input.triggered_by_user_id,
    });

    let running: IngestJob;
    try {
      running = await this.jobs.markRunning(job.id);
    } catch {
      // If we couldn't even transition to running, something is very
      // wrong — bubble out with the original job snapshot.
      throw new PipelineError(
        `unable to start job ${job.id}`,
        "manifest_error",
      );
    }

    try {
      return await this.runInner({ ...input, job: running });
    } catch (err) {
      const errorLog =
        err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      const failed = await this.jobs.markFinished(
        running.id,
        "failed",
        { questions_generated: 0, questions_failed: 0 },
        errorLog,
      );
      return { job: failed, passage: null };
    }
  }

  private async runInner(input: {
    job: IngestJob;
    manifest_id: number;
    body: string;
    word_count: number;
    question_count?: number;
    exam_board?: ExamBoard;
    question_types?: QuestionType[];
  }): Promise<PipelineResult> {
    // Step 2: load + validate the manifest.
    let manifest: PassageManifest;
    try {
      manifest = await this.manifests.loadById(input.manifest_id);
    } catch (err) {
      if (err instanceof ManifestError) {
        throw new PipelineError(
          `manifest ${input.manifest_id}: ${err.message}`,
          "manifest_error",
        );
      }
      throw err;
    }

    console.log(
      `[ingest #${input.job.id}] manifest loaded: "${manifest.title}" `
      + `(${input.word_count} words provided)`,
    );

    // Step 3: normalise the body text for paragraph display.
    // Content adapters may produce text with single newlines (hard wraps)
    // or double newlines (paragraph breaks). Collapse hard wraps within
    // paragraphs while preserving paragraph boundaries.
    const body = normaliseBody(input.body);
    const word_count = countWordsInBody(body);

    // Step 4: insert the passage as pending_review.
    const passage = await this.passages.create({
      title: manifest.title,
      author: manifest.author,
      source: manifest.source,
      source_url: manifest.source_url,
      year_published: manifest.year_published,
      genre: manifest.genre,
      subgenre: manifest.subgenre,
      exam_boards: manifest.exam_boards,
      difficulty: manifest.difficulty,
      reading_level: manifest.reading_level,
      word_count,
      themes: manifest.themes,
      body,
      status: "pending_review",
    });

    // Step 5: build the LLM client via the factory. Factory errors
    // surface early so we can stamp the job as failed without racking
    // up half-completed state.
    let llm;
    try {
      llm = await this.llmFactory.buildClient();
      console.log(
        `[ingest #${input.job.id}] LLM client: provider=${llm.provider} model=${llm.model}`,
      );
    } catch (err) {
      if (err instanceof LLMError) {
        throw new PipelineError(
          `LLM not available: ${err.message}`,
          "llm_unavailable",
        );
      }
      throw err;
    }

    // Step 6: generate questions.
    const target_board = input.exam_board ?? manifest.exam_boards[0];
    const target_types =
      input.question_types ??
      (manifest.question_types_suitable.length > 0
        ? manifest.question_types_suitable
        : (["retrieval", "inference", "vocabulary-in-context"] as QuestionType[]));
    const target_count = input.question_count ?? 8;

    console.log(
      `[ingest #${input.job.id}] generating ${target_count} questions `
      + `(board=${target_board}, types=${target_types.join(",")})`,
    );

    const generator = new QuestionGenerator(llm);
    let genResult;
    try {
      genResult = await generator.generate({
        passage,
        exam_board: target_board,
        count: target_count,
        question_types: target_types,
        difficulty: manifest.difficulty,
      });
      console.log(
        `[ingest #${input.job.id}] generation done: `
        + `${genResult.questions.length} ok / ${genResult.failed_count} failed`,
      );
    } catch (err) {
      if (err instanceof GeneratorError) {
        console.error(
          `[ingest #${input.job.id}] generation FAILED [${err.code}]: ${err.message}`,
        );
        throw new PipelineError(
          `question generation failed [${err.code}]: ${err.message}`,
          "generator_error",
        );
      }
      throw err;
    }

    // Step 7: insert generated questions as pending_review.
    await this.questions.createMany(
      genResult.questions.map((q) => ({
        passage_id: passage.id,
        passage_version: passage.version,
        text: q.text,
        question_type: q.question_type,
        exam_boards: q.exam_boards,
        difficulty: q.difficulty,
        options: q.options,
        correct_option: q.correct_option,
        status: "pending_review",
      })),
    );

    // Step 8: finalise the job.
    const finalJob = await this.jobs.markFinished(
      input.job.id,
      "completed",
      {
        questions_generated: genResult.questions.length,
        questions_failed: genResult.failed_count,
      },
      genResult.failure_messages.length > 0
        ? `partial: ${genResult.failure_messages.join("\n")}`
        : undefined,
    );

    console.log(
      `[ingest #${input.job.id}] job completed: `
      + `${genResult.questions.length} questions / ${genResult.failed_count} failed`,
    );

    return { job: finalJob, passage };
  }
}

/**
 * Normalise passage body text for display. Collapses single newlines
 * (hard line wraps) to spaces within paragraphs, while preserving blank
 * lines as paragraph boundaries. Also normalises \r\n → \n and strips
 * trailing whitespace.
 */
function normaliseBody(text: string): string {
  // Canonicalize line endings.
  let normalised = text.replace(/\r\n/g, "\n");
  // Split on blank lines to detect paragraph boundaries.
  const paragraphs = normalised.split(/\n\s*\n/);
  // Within each paragraph, collapse single newlines to spaces.
  const folded = paragraphs.map((p) => p.replace(/\s*\n\s*/g, " ").trim());
  // Re-join paragraphs with double newlines.
  return folded.filter((p) => p.length > 0).join("\n\n");
}

function countWordsInBody(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}
