import { describe, expect, it, vi } from "vitest";
import type { Passage } from "@story-sleuth/shared";
import type { ILLMClient } from "../llm/types.js";
import { LLMError } from "../llm/types.js";
import { GeneratorError, QuestionGenerator } from "./question-generator.js";

const PASSAGE: Passage = {
  id: "11111111-1111-4111-8111-111111111111",
  version: 1,
  title: "Test Passage",
  author: "Test Author",
  source: "Test Source",
  source_url: "https://example.com/test",
  year_published: 1900,
  genre: "fiction",
  subgenre: "test",
  exam_boards: ["GL"],
  difficulty: 2,
  reading_level: "Year 5-6",
  word_count: 100,
  themes: [],
  body: "Test passage body.",
  status: "pending_review",
  created_at: "2026-04-17T10:00:00.000Z",
  published_at: null,
};

function validQuestionJson(overrides: Partial<Record<string, unknown>> = {}): string {
  return JSON.stringify({
    text: "Why does the character stop?",
    question_type: "inference",
    exam_boards: ["GL"],
    difficulty: 2,
    options: [
      { letter: "A", text: "opt A", explanation_if_chosen: "why A (wrong)" },
      { letter: "B", text: "opt B", explanation_if_chosen: "why B (right)" },
      { letter: "C", text: "opt C", explanation_if_chosen: "why C (wrong)" },
      { letter: "D", text: "opt D", explanation_if_chosen: "why D (wrong)" },
    ],
    correct_option: "B",
    ...overrides,
  });
}

function makeClient(
  responses: Array<string | Error>,
): { client: ILLMClient; generate: ReturnType<typeof vi.fn> } {
  let i = 0;
  const generate = vi.fn(async () => {
    const next = responses[i++];
    if (next === undefined) throw new Error("no more fake responses");
    if (next instanceof Error) throw next;
    return { text: next, model: "test-model" };
  });
  const client: ILLMClient = {
    provider: "qwen",
    model: "test-model",
    generate,
  };
  return { client, generate };
}

describe("QuestionGenerator", () => {
  it("returns N valid questions when the LLM responds cleanly", async () => {
    const { client, generate } = makeClient([
      validQuestionJson({ text: "Q1" }),
      validQuestionJson({ text: "Q2" }),
      validQuestionJson({ text: "Q3" }),
    ]);
    const gen = new QuestionGenerator(client);
    const result = await gen.generate({
      passage: PASSAGE,
      exam_board: "GL",
      count: 3,
      question_types: ["inference"],
    });
    expect(result.questions).toHaveLength(3);
    expect(result.failed_count).toBe(0);
    expect(result.questions.map((q) => q.text)).toEqual(["Q1", "Q2", "Q3"]);
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("strips ```json fences the model sometimes adds", async () => {
    const { client } = makeClient([
      "```json\n" + validQuestionJson({ text: "fenced" }) + "\n```",
    ]);
    const gen = new QuestionGenerator(client);
    const result = await gen.generate({
      passage: PASSAGE,
      exam_board: "GL",
      count: 1,
      question_types: ["inference"],
    });
    expect(result.questions[0]!.text).toBe("fenced");
  });

  it("retries on malformed JSON and succeeds on the 2nd attempt", async () => {
    const { client, generate } = makeClient([
      "not JSON at all",
      validQuestionJson({ text: "recovered" }),
    ]);
    const gen = new QuestionGenerator(client);
    const result = await gen.generate({
      passage: PASSAGE,
      exam_board: "GL",
      count: 1,
      question_types: ["inference"],
    });
    expect(result.questions[0]!.text).toBe("recovered");
    expect(generate).toHaveBeenCalledTimes(2);
    // Second call should include a hint about the prior failure.
    const secondCall = generate.mock.calls[1]![0] as { user: string };
    expect(secondCall.user).toMatch(/previous attempt failed validation/);
  });

  it("retries on schema validation failure (duplicate option letters)", async () => {
    const duplicateLetters = JSON.stringify({
      text: "bad options",
      question_type: "inference",
      exam_boards: ["GL"],
      difficulty: 2,
      options: [
        { letter: "A", text: "a", explanation_if_chosen: "x" },
        { letter: "A", text: "a2", explanation_if_chosen: "y" },
        { letter: "C", text: "c", explanation_if_chosen: "z" },
        { letter: "D", text: "d", explanation_if_chosen: "w" },
      ],
      correct_option: "A",
    });
    const { client, generate } = makeClient([
      duplicateLetters,
      validQuestionJson({ text: "fixed" }),
    ]);
    const gen = new QuestionGenerator(client);
    const result = await gen.generate({
      passage: PASSAGE,
      exam_board: "GL",
      count: 1,
      question_types: ["inference"],
    });
    expect(result.questions[0]!.text).toBe("fixed");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("gives up on a single question after RETRIES_PER_QUESTION + 1 attempts, but keeps the others", async () => {
    const { client } = makeClient([
      // First question: 3 bad attempts → given up on.
      "bad1",
      "bad2",
      "bad3",
      // Second question: fine on first try.
      validQuestionJson({ text: "ok" }),
    ]);
    const gen = new QuestionGenerator(client);
    const result = await gen.generate({
      passage: PASSAGE,
      exam_board: "GL",
      count: 2,
      question_types: ["inference"],
    });
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]!.text).toBe("ok");
    expect(result.failed_count).toBe(1);
    expect(result.failure_messages[0]).toMatch(/exhausted/);
  });

  it("throws nothing_valid when every generation fails", async () => {
    const { client } = makeClient([
      "bad1",
      "bad2",
      "bad3",
      "bad4",
      "bad5",
      "bad6",
    ]);
    const gen = new QuestionGenerator(client);
    await expect(
      gen.generate({
        passage: PASSAGE,
        exam_board: "GL",
        count: 2,
        question_types: ["inference"],
      }),
    ).rejects.toMatchObject({
      name: "GeneratorError",
      code: "nothing_valid",
    });
  });

  it("propagates an LLMError as GeneratorError(llm_failed)", async () => {
    const { client } = makeClient([
      new LLMError("rate limited", "rate_limited", "qwen", true),
    ]);
    const gen = new QuestionGenerator(client);
    await expect(
      gen.generate({
        passage: PASSAGE,
        exam_board: "GL",
        count: 1,
        question_types: ["inference"],
      }),
    ).rejects.toMatchObject({
      name: "GeneratorError",
    });
  });

  it("coerces exam_boards to the requested board even if the model returns something else", async () => {
    const drifted = JSON.stringify({
      text: "drifted",
      question_type: "inference",
      exam_boards: ["CEM"], // model returned the wrong board
      difficulty: 2,
      options: [
        { letter: "A", text: "a", explanation_if_chosen: "x" },
        { letter: "B", text: "b", explanation_if_chosen: "y" },
        { letter: "C", text: "c", explanation_if_chosen: "z" },
        { letter: "D", text: "d", explanation_if_chosen: "w" },
      ],
      correct_option: "B",
    });
    const { client } = makeClient([drifted]);
    const gen = new QuestionGenerator(client);
    const result = await gen.generate({
      passage: PASSAGE,
      exam_board: "GL",
      count: 1,
      question_types: ["inference"],
    });
    expect(result.questions[0]!.exam_boards).toEqual(["GL"]);
  });

  it("rotates through the requested question types", async () => {
    const { client, generate } = makeClient([
      validQuestionJson({ question_type: "inference" }),
      validQuestionJson({ question_type: "retrieval" }),
      validQuestionJson({ question_type: "vocabulary-in-context" }),
      validQuestionJson({ question_type: "inference" }),
    ]);
    const gen = new QuestionGenerator(client);
    const result = await gen.generate({
      passage: PASSAGE,
      exam_board: "GL",
      count: 4,
      question_types: ["inference", "retrieval", "vocabulary-in-context"],
    });
    expect(result.questions).toHaveLength(4);
    // Verify the prompt asked for the rotating type.
    const systems = generate.mock.calls.map(
      (c) => (c[0] as { system: string }).system,
    );
    expect(systems[0]).toMatch(/inference/);
    expect(systems[1]).toMatch(/retrieval/);
    expect(systems[2]).toMatch(/vocabulary in context/);
    expect(systems[3]).toMatch(/inference/);
  });

  // Implementation detail reference (not a runtime assert) — documents
  // why GeneratorError exists in the API surface:
  void GeneratorError;
});
