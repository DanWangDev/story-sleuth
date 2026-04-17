import type {
  Passage,
  Question,
  Session,
  StudentAttempt,
  SessionMode,
  ExamBoard,
  OptionLetter,
  QuestionType,
} from "@story-sleuth/shared";
import type { PassageRepository } from "../repositories/interfaces/passage-repository.js";
import type { QuestionRepository } from "../repositories/interfaces/question-repository.js";
import type { SessionRepository } from "../repositories/interfaces/session-repository.js";
import type {
  StudentAttemptRepository,
  StudentAttemptCreateInput,
} from "../repositories/interfaces/student-attempt-repository.js";

/**
 * The question shape students see during an active session. Per the
 * design doc's feedback-timing rule, per-option explanations and the
 * correct answer are HIDDEN until the session ends. If a client could
 * read them from the wire, the session is cheatable.
 */
export interface ActiveQuestion {
  id: string;
  text: string;
  question_type: Question["question_type"];
  exam_boards: Question["exam_boards"];
  difficulty: Question["difficulty"];
  options: Array<{ letter: OptionLetter; text: string }>;
}

/** Question as revealed on the results page (after the session ends). */
export type ResolvedQuestion = Question;

export interface SessionPayload {
  session: Session;
  passage: Passage;
  /** Questions — redacted (ActiveQuestion) if session is in progress,
   *  full (ResolvedQuestion) if ended. */
  questions: ActiveQuestion[] | ResolvedQuestion[];
  active: boolean;
}

export interface SessionResults {
  session: Session;
  passage: Passage;
  questions: ResolvedQuestion[];
  attempts: StudentAttempt[];
  summary: {
    total: number;
    correct: number;
    accuracy: number;
    per_type_breakdown: Array<{
      question_type: QuestionType;
      total: number;
      correct: number;
      accuracy: number;
    }>;
    unanswered_question_ids: string[];
  };
}

export class SessionError extends Error {
  constructor(
    message: string,
    readonly code:
      | "no_content_for_exam_board"
      | "passage_not_found"
      | "session_not_found"
      | "session_forbidden"
      | "session_ended"
      | "question_not_in_session"
      | "duplicate_answer"
      | "invalid_option",
    readonly http_status: number,
  ) {
    super(message);
    this.name = "SessionError";
  }
}

/**
 * Practice and test sessions share 95% of their logic — only the timer
 * and the admin-configured number-of-questions differ. All the "hide
 * feedback during active / show on end" gating is the same.
 */
export interface CreateSessionInput {
  user_id: number;
  mode: SessionMode;
  exam_board: ExamBoard;
  /** Pick a random published passage if omitted. */
  passage_id?: string;
  /** Timer in seconds for test mode; ignored in practice mode. */
  time_allowed_seconds?: number;
}

export class SessionService {
  constructor(
    private readonly passages: PassageRepository,
    private readonly questions: QuestionRepository,
    private readonly sessions: SessionRepository,
    private readonly attempts: StudentAttemptRepository,
  ) {}

  async createSession(input: CreateSessionInput): Promise<SessionPayload> {
    // Pick the passage.
    let passage: Passage | null;
    if (input.passage_id) {
      passage = await this.passages.findLatestPublishedById(input.passage_id);
      if (!passage) {
        throw new SessionError(
          `passage not found or not published: ${input.passage_id}`,
          "passage_not_found",
          404,
        );
      }
    } else {
      // Random pick from published passages for this exam board.
      const available = await this.passages.listPublishedByExamBoard(
        input.exam_board,
        50,
        0,
      );
      if (available.length === 0) {
        throw new SessionError(
          `no published content for exam_board ${input.exam_board}`,
          "no_content_for_exam_board",
          404,
        );
      }
      passage = available[Math.floor(Math.random() * available.length)]!;
    }

    // Find published questions for this passage version, filtered to
    // those that cover the requested exam board (CEM-styled vs GL-styled
    // matters — decision #13 from eng review).
    const allForPassage = await this.questions.findByPassage(
      passage.id,
      passage.version,
      "published",
    );
    const questionsForBoard = allForPassage.filter((q) =>
      q.exam_boards.includes(input.exam_board),
    );
    if (questionsForBoard.length === 0) {
      throw new SessionError(
        `no published questions for passage ${passage.id} v${passage.version} on board ${input.exam_board}`,
        "no_content_for_exam_board",
        404,
      );
    }

    // Create the session, pinning the passage version.
    const session = await this.sessions.create({
      user_id: input.user_id,
      mode: input.mode,
      exam_board: input.exam_board,
      passage_id: passage.id,
      passage_version: passage.version,
      question_ids: questionsForBoard.map((q) => q.id),
      time_allowed_seconds:
        input.mode === "test" ? (input.time_allowed_seconds ?? 2400) : null,
    });

    return {
      session,
      passage,
      questions: questionsForBoard.map(redactForActive),
      active: true,
    };
  }

  async loadSession(
    session_id: string,
    user_id: number,
  ): Promise<SessionPayload> {
    const session = await this.sessions.findById(session_id);
    if (!session) {
      throw new SessionError("session not found", "session_not_found", 404);
    }
    if (session.user_id !== user_id) {
      throw new SessionError(
        "session does not belong to you",
        "session_forbidden",
        403,
      );
    }

    const passage = await this.passages.findById(
      session.passage_id,
      session.passage_version,
    );
    if (!passage) {
      throw new SessionError(
        "passage version pinned on this session no longer exists",
        "passage_not_found",
        500,
      );
    }

    const rawQuestions = await this.questions.findBySessionQuestionIds(
      session.question_ids,
    );
    const active = session.ended_at === null;

    return {
      session,
      passage,
      questions: active
        ? rawQuestions.map(redactForActive)
        : rawQuestions,
      active,
    };
  }

  async submitAnswer(input: {
    session_id: string;
    user_id: number;
    question_id: string;
    selected_letter: OptionLetter;
    time_taken_ms: number;
  }): Promise<{ accepted: true; question_id: string }> {
    const session = await this.sessions.findById(input.session_id);
    if (!session) {
      throw new SessionError("session not found", "session_not_found", 404);
    }
    if (session.user_id !== input.user_id) {
      throw new SessionError(
        "session does not belong to you",
        "session_forbidden",
        403,
      );
    }
    if (session.ended_at !== null) {
      throw new SessionError("session already ended", "session_ended", 409);
    }
    if (!session.question_ids.includes(input.question_id)) {
      throw new SessionError(
        "question is not part of this session",
        "question_not_in_session",
        400,
      );
    }

    const question = await this.questions.findById(input.question_id);
    if (!question) {
      throw new SessionError(
        "question not found",
        "question_not_in_session",
        400,
      );
    }

    // Idempotency on (session_id, question_id): if the student already
    // answered this question in this session, reject with 409 rather
    // than silently creating a duplicate attempt.
    const existingAttempts = await this.attempts.findBySession(session.id);
    if (existingAttempts.some((a) => a.question_id === input.question_id)) {
      throw new SessionError(
        "already answered this question in this session",
        "duplicate_answer",
        409,
      );
    }

    const selected = question.options.find(
      (o) => o.letter === input.selected_letter,
    );
    if (!selected) {
      throw new SessionError(
        `selected_letter ${input.selected_letter} is not an option for this question`,
        "invalid_option",
        400,
      );
    }

    const attemptInput: StudentAttemptCreateInput = {
      session_id: session.id,
      user_id: input.user_id,
      question_id: input.question_id,
      question_type_tag: question.question_type,
      exam_board: session.exam_board,
      difficulty: question.difficulty,
      selected_letter: input.selected_letter,
      is_correct: input.selected_letter === question.correct_option,
      time_taken_ms: input.time_taken_ms,
    };
    await this.attempts.create(attemptInput);

    // Feedback is BATCHED to end-of-session — the response deliberately
    // does NOT disclose is_correct. Students get everything when they
    // end the session.
    return { accepted: true, question_id: input.question_id };
  }

  async endSession(
    session_id: string,
    user_id: number,
  ): Promise<SessionResults> {
    const session = await this.sessions.findById(session_id);
    if (!session) {
      throw new SessionError("session not found", "session_not_found", 404);
    }
    if (session.user_id !== user_id) {
      throw new SessionError(
        "session does not belong to you",
        "session_forbidden",
        403,
      );
    }

    // Idempotent: markEnded returns the existing ended_at if already ended.
    const ended = await this.sessions.markEnded(session.id);

    const [passage, rawQuestions, attempts] = await Promise.all([
      this.passages.findById(ended.passage_id, ended.passage_version),
      this.questions.findBySessionQuestionIds(ended.question_ids),
      this.attempts.findBySession(ended.id),
    ]);
    if (!passage) {
      throw new SessionError(
        "passage version pinned on this session no longer exists",
        "passage_not_found",
        500,
      );
    }

    const answered = new Map(attempts.map((a) => [a.question_id, a]));
    const unanswered_question_ids = ended.question_ids.filter(
      (qid) => !answered.has(qid),
    );

    const correct = attempts.filter((a) => a.is_correct).length;
    const total = attempts.length;

    // Per-type breakdown, answered only.
    const byType = new Map<
      QuestionType,
      { total: number; correct: number }
    >();
    for (const a of attempts) {
      const existing = byType.get(a.question_type_tag) ?? { total: 0, correct: 0 };
      existing.total += 1;
      if (a.is_correct) existing.correct += 1;
      byType.set(a.question_type_tag, existing);
    }
    const per_type_breakdown = Array.from(byType.entries()).map(
      ([question_type, stats]) => ({
        question_type,
        total: stats.total,
        correct: stats.correct,
        accuracy: stats.total === 0 ? 0 : stats.correct / stats.total,
      }),
    );

    return {
      session: ended,
      passage,
      questions: rawQuestions,
      attempts,
      summary: {
        total,
        correct,
        accuracy: total === 0 ? 0 : correct / total,
        per_type_breakdown,
        unanswered_question_ids,
      },
    };
  }

  async listInProgressForUser(user_id: number): Promise<Session[]> {
    return await this.sessions.findInProgressByUser(user_id);
  }
}

function redactForActive(q: Question): ActiveQuestion {
  return {
    id: q.id,
    text: q.text,
    question_type: q.question_type,
    exam_boards: q.exam_boards,
    difficulty: q.difficulty,
    options: q.options.map((o) => ({ letter: o.letter, text: o.text })),
  };
}
