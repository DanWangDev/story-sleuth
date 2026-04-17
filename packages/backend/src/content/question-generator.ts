import {
  GeneratedQuestionSchema,
  type Difficulty,
  type ExamBoard,
  type GeneratedQuestion,
  type Passage,
  type QuestionType,
} from "@story-sleuth/shared";
import type { ILLMClient } from "../llm/types.js";
import { LLMError } from "../llm/types.js";

export class GeneratorError extends Error {
  constructor(
    message: string,
    readonly code:
      | "llm_failed"
      | "parse_failed"
      | "validation_failed"
      | "nothing_valid",
  ) {
    super(message);
    this.name = "GeneratorError";
  }
}

export interface GenerationRequest {
  passage: Passage;
  exam_board: ExamBoard;
  count: number;
  /** Question-type mix to request. Generator asks for at least one of each. */
  question_types: QuestionType[];
  /** Override 1-3 difficulty target; defaults to passage.difficulty. */
  difficulty?: Difficulty;
}

export interface GenerationResult {
  questions: GeneratedQuestion[];
  /** LLM attempts that failed parse/validation even after retries. */
  failed_count: number;
  /** Per-failed-attempt error messages, for the admin ingest log. */
  failure_messages: string[];
}

/**
 * Turns a passage into a batch of exam-board-styled questions. Each
 * question goes through three layers (JSON parse → Zod schema →
 * cross-field sanity); failures retry up to RETRIES_PER_QUESTION times
 * with a tightening prompt hint before being given up on.
 *
 * The admin review queue shows every generated question as `draft`
 * until a human clicks Publish — we NEVER let generated questions go
 * straight to students. Matches the design doc's "3-layer + human
 * review" gate.
 */
export class QuestionGenerator {
  private static readonly RETRIES_PER_QUESTION = 2;

  constructor(private readonly llm: ILLMClient) {}

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const target_count = Math.max(1, Math.floor(req.count));
    const results: GeneratedQuestion[] = [];
    const failures: string[] = [];

    for (let i = 0; i < target_count; i += 1) {
      const type = req.question_types[i % req.question_types.length]!;
      const question = await this.generateOne({
        ...req,
        question_type: type,
      }).catch((err: unknown) => {
        failures.push(
          err instanceof Error ? err.message : String(err),
        );
        return null;
      });
      if (question !== null) results.push(question);
    }

    if (results.length === 0) {
      throw new GeneratorError(
        `generator produced 0 valid questions (${failures.length} failures): ${failures.join("; ")}`,
        "nothing_valid",
      );
    }

    return {
      questions: results,
      failed_count: failures.length,
      failure_messages: failures,
    };
  }

  private async generateOne(input: {
    passage: Passage;
    exam_board: ExamBoard;
    question_type: QuestionType;
    difficulty?: Difficulty;
  }): Promise<GeneratedQuestion> {
    let lastError: string | null = null;
    for (let attempt = 0; attempt <= QuestionGenerator.RETRIES_PER_QUESTION; attempt += 1) {
      const { system, user } = buildPrompt(input, lastError);
      let raw: string;
      try {
        const result = await this.llm.generate({
          system,
          user,
          temperature: 0.6,
          max_tokens: 1200,
          json_schema: QUESTION_JSON_SHAPE,
        });
        raw = result.text.trim();
      } catch (err) {
        if (err instanceof LLMError) {
          throw new GeneratorError(
            `LLM call failed (attempt ${attempt + 1}): ${err.message}`,
            "llm_failed",
          );
        }
        throw err;
      }

      // Layer 1: JSON parse.
      const stripped = stripCodeFence(raw);
      let parsed: unknown;
      try {
        parsed = JSON.parse(stripped);
      } catch (err) {
        lastError = `JSON parse failed: ${(err as Error).message}. Ensure the response is a single JSON object with NO markdown fences.`;
        continue;
      }

      // Layer 2 + 3: Zod schema (includes cross-field sanity check —
      // exactly 4 options, unique letters, correct_option ∈ options).
      const validated = GeneratedQuestionSchema.safeParse(parsed);
      if (!validated.success) {
        lastError = `schema validation failed: ${validated.error.issues
          .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
          .join("; ")}`;
        continue;
      }

      // Additional sanity: the model sometimes generates questions for a
      // different exam_board than asked. Coerce to the requested board
      // so downstream filtering does the right thing.
      const corrected: GeneratedQuestion = {
        ...validated.data,
        exam_boards: [input.exam_board],
      };
      return corrected;
    }

    throw new GeneratorError(
      `exhausted ${QuestionGenerator.RETRIES_PER_QUESTION + 1} attempts: ${lastError ?? "unknown"}`,
      lastError?.startsWith("JSON parse") ? "parse_failed" : "validation_failed",
    );
  }
}

/**
 * JSON-shape hint for LLM providers that support structured output
 * modes (OpenAI response_format, Anthropic tool_use). The generator
 * also enforces this via Zod after the fact — the hint is a nudge,
 * not a contract.
 */
const QUESTION_JSON_SHAPE = {
  type: "object",
  properties: {
    text: { type: "string" },
    question_type: { type: "string" },
    exam_boards: { type: "array", items: { type: "string" } },
    difficulty: { type: "integer", enum: [1, 2, 3] },
    options: {
      type: "array",
      items: {
        type: "object",
        properties: {
          letter: { type: "string", enum: ["A", "B", "C", "D"] },
          text: { type: "string" },
          explanation_if_chosen: { type: "string" },
        },
        required: ["letter", "text", "explanation_if_chosen"],
      },
    },
    correct_option: { type: "string", enum: ["A", "B", "C", "D"] },
  },
  required: [
    "text",
    "question_type",
    "exam_boards",
    "difficulty",
    "options",
    "correct_option",
  ],
} as const;

function stripCodeFence(raw: string): string {
  // Allow the model to wrap its JSON in ```json ... ``` fences.
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(raw.trim());
  return fenceMatch ? fenceMatch[1]!.trim() : raw;
}

function buildPrompt(
  input: {
    passage: Passage;
    exam_board: ExamBoard;
    question_type: QuestionType;
    difficulty?: Difficulty;
  },
  priorErrorHint: string | null,
): { system: string; user: string } {
  const targetDifficulty = input.difficulty ?? input.passage.difficulty;
  const humanType = input.question_type.replaceAll("-", " ");
  const boardHint = EXAM_BOARD_STYLE_HINTS[input.exam_board];

  const system = [
    `You are writing a UK 11+ reading comprehension multiple-choice question.`,
    `The target exam board is ${input.exam_board}. ${boardHint}`,
    `Produce exactly one question of type: ${humanType}. Difficulty: ${targetDifficulty}/3.`,
    ``,
    `Hard rules:`,
    `  - Output ONE valid JSON object, no markdown fences, no prose around it.`,
    `  - Exactly 4 options labelled A, B, C, D. Each letter appears exactly once.`,
    `  - \`correct_option\` MUST match one of the option letters.`,
    `  - Each option's \`explanation_if_chosen\` is 1-3 sentences calibrated for a 10-11 year old.`,
    `    For the correct option: cite passage evidence.`,
    `    For wrong options: explain the plausible misreading, then point back to the passage.`,
    `  - \`exam_boards\` must be the single-element array ["${input.exam_board}"].`,
    `  - \`difficulty\` must equal ${targetDifficulty}.`,
    `  - \`question_type\` must be the string "${input.question_type}".`,
    `  - Do NOT include answer keys outside \`correct_option\`. No "Answer: B" in the text.`,
  ].join("\n");

  const user = [
    `Passage title: "${input.passage.title}" by ${input.passage.author}.`,
    ``,
    `Passage text:`,
    input.passage.body,
    ``,
    priorErrorHint
      ? `Your previous attempt failed validation: ${priorErrorHint}\nFix the issue in this response.`
      : `Write the question now. Return only the JSON object.`,
  ].join("\n");

  return { system, user };
}

const EXAM_BOARD_STYLE_HINTS: Record<ExamBoard, string> = {
  CEM: "CEM favours inference and deduction. Distractors are plausible misreadings; correct answer requires close-reading across 2-3 sentences.",
  GL: "GL emphasises retrieval and vocabulary-in-context. Options are crisp; correct answer is often a precise paraphrase of a single passage line.",
  ISEB: "ISEB independent-school style. Balanced mix; slightly longer options; question stems can expect synthesis across the passage.",
};
