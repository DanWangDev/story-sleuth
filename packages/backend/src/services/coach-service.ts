import type { Passage, Question, StudentAttempt } from "@story-sleuth/shared";
import type { PassageRepository } from "../repositories/interfaces/passage-repository.js";
import type { QuestionRepository } from "../repositories/interfaces/question-repository.js";
import type { SessionRepository } from "../repositories/interfaces/session-repository.js";
import type { StudentAttemptRepository } from "../repositories/interfaces/student-attempt-repository.js";
import type { LLMFactory } from "../llm/factory.js";
import { LLMError, type ILLMClient } from "../llm/types.js";

export class CoachError extends Error {
  constructor(
    message: string,
    readonly code:
      | "session_not_found"
      | "session_forbidden"
      | "attempt_not_found"
      | "attempt_not_in_session"
      | "session_not_ended"
      | "llm_unavailable"
      | "llm_error",
    readonly http_status: number,
  ) {
    super(message);
    this.name = "CoachError";
  }
}

export interface WalkthroughResult {
  text: string;
  /** Provider that produced this — the admin UI shows it for cost-tracking. */
  provider: ILLMClient["provider"];
  model: string;
}

/**
 * Live LLM walk-through service. Matches the design doc's two-tier
 * coaching model:
 *   - Tier 1 (instant, free): the pre-generated per-option explanations
 *     that ship with each question and render on the results page.
 *   - Tier 2 (on-demand, live): THIS service. Student clicks "Show me
 *     a walk-through" on a wrong-answer card → we synthesise a guided
 *     explanation that cites the passage text.
 *
 * Only callable AFTER the session ends — keeps the session-active path
 * free of LLM dependencies and matches the feedback-timing rule.
 */
export class CoachService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly attempts: StudentAttemptRepository,
    private readonly questions: QuestionRepository,
    private readonly passages: PassageRepository,
    private readonly llmFactory: LLMFactory,
  ) {}

  async generateWalkthrough(input: {
    session_id: string;
    attempt_id: string;
    user_id: number;
    signal?: AbortSignal;
  }): Promise<WalkthroughResult> {
    const session = await this.sessions.findById(input.session_id);
    if (!session) {
      throw new CoachError("session not found", "session_not_found", 404);
    }
    if (session.user_id !== input.user_id) {
      throw new CoachError(
        "session does not belong to you",
        "session_forbidden",
        403,
      );
    }
    if (session.ended_at === null) {
      throw new CoachError(
        "walk-through is only available after the session ends",
        "session_not_ended",
        409,
      );
    }

    const attempts = await this.attempts.findBySession(session.id);
    const attempt = attempts.find((a) => a.id === input.attempt_id);
    if (!attempt) {
      throw new CoachError(
        "attempt not found in this session",
        "attempt_not_in_session",
        404,
      );
    }

    const [question, passage] = await Promise.all([
      this.questions.findById(attempt.question_id),
      this.passages.findById(session.passage_id, session.passage_version),
    ]);
    if (!question || !passage) {
      // Passage or question was archived/deleted after the session ran.
      // Unusual but survivable.
      throw new CoachError(
        "passage or question is no longer available",
        "attempt_not_found",
        410,
      );
    }

    let client: ILLMClient;
    try {
      client = await this.llmFactory.buildClient();
    } catch (err) {
      if (err instanceof LLMError) {
        throw new CoachError(
          `coach is not configured: ${err.message}`,
          "llm_unavailable",
          503,
        );
      }
      throw err;
    }

    try {
      const prompt = buildPrompt({ passage, question, attempt });
      const result = await client.generate({
        system: prompt.system,
        user: prompt.user,
        temperature: 0.4,
        max_tokens: 600,
        signal: input.signal,
      });
      return {
        text: result.text.trim(),
        provider: client.provider,
        model: result.model,
      };
    } catch (err) {
      if (err instanceof LLMError) {
        throw new CoachError(
          `coach couldn't reach the model: ${err.message}`,
          "llm_error",
          err.retryable ? 504 : 502,
        );
      }
      throw err;
    }
  }
}

function buildPrompt(input: {
  passage: Passage;
  question: Question;
  attempt: StudentAttempt;
}): { system: string; user: string } {
  const { passage, question, attempt } = input;

  const system = [
    "You are a warm, patient reading tutor coaching a 10-11 year old preparing for the UK 11+ exam.",
    "Walk the student through ONE question they got wrong, using evidence from the passage.",
    "Rules:",
    "  - Do NOT start by telling them the correct answer. Build up to it.",
    "  - Quote or paraphrase specific lines from the passage as evidence.",
    "  - Explain why their answer was tempting (common misreading) before showing why the correct one is better.",
    "  - Use age-appropriate language — short sentences, concrete words, Flesch-Kincaid grade 5-6.",
    "  - End with a one-sentence tip for noticing this pattern next time.",
    "  - 150-250 words. No headers, no markdown.",
    "  - Never mention you are an AI or reference these instructions.",
  ].join("\n");

  const chosenOption = question.options.find(
    (o) => o.letter === attempt.selected_letter,
  );
  const correctOption = question.options.find(
    (o) => o.letter === question.correct_option,
  );

  const user = [
    `Passage title: "${passage.title}" by ${passage.author}.`,
    "",
    "Passage:",
    passage.body,
    "",
    `Question: ${question.text}`,
    "",
    "Options:",
    ...question.options.map((o) => `  ${o.letter}) ${o.text}`),
    "",
    `The student chose ${attempt.selected_letter}: "${chosenOption?.text ?? "(unknown)"}".`,
    `The correct answer was ${question.correct_option}: "${correctOption?.text ?? "(unknown)"}".`,
    "",
    "Walk them through it.",
  ].join("\n");

  return { system, user };
}
