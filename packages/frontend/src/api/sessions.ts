import type {
  Passage,
  Question,
  Session,
  StudentAttempt,
  OptionLetter,
  ExamBoard,
  SessionMode,
  QuestionType,
} from "@story-sleuth/shared";
import { apiFetch } from "./client.js";

/**
 * What the frontend sees while a session is ACTIVE. Correct answers
 * and per-option explanations are intentionally stripped by the
 * backend so they can't be exfiltrated from the network.
 */
export interface ActiveQuestion {
  id: string;
  text: string;
  question_type: QuestionType;
  exam_boards: Question["exam_boards"];
  difficulty: Question["difficulty"];
  options: Array<{ letter: OptionLetter; text: string }>;
}

export interface ActiveSessionPayload {
  session: Session;
  passage: Passage;
  questions: ActiveQuestion[];
  active: true;
}

export interface ResolvedSessionPayload {
  session: Session;
  passage: Passage;
  questions: Question[];
  active: false;
}

export type SessionPayload = ActiveSessionPayload | ResolvedSessionPayload;

export interface SessionResults {
  session: Session;
  passage: Passage;
  questions: Question[];
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

export interface CreateSessionBody {
  mode: SessionMode;
  exam_board: ExamBoard;
  passage_id?: string;
  time_allowed_seconds?: number;
}

export async function createSession(
  body: CreateSessionBody,
): Promise<SessionPayload> {
  return apiFetch<SessionPayload>("/api/sessions", { method: "POST", body });
}

export async function loadSession(id: string): Promise<SessionPayload> {
  return apiFetch<SessionPayload>(`/api/sessions/${id}`);
}

export async function submitAnswer(
  session_id: string,
  body: {
    question_id: string;
    selected_letter: OptionLetter;
    time_taken_ms: number;
  },
): Promise<{ accepted: true; question_id: string }> {
  return apiFetch(`/api/sessions/${session_id}/answers`, {
    method: "POST",
    body,
  });
}

export async function endSession(id: string): Promise<SessionResults> {
  return apiFetch<SessionResults>(`/api/sessions/${id}/end`, {
    method: "POST",
  });
}

export async function listInProgress(): Promise<{ sessions: Session[] }> {
  return apiFetch("/api/sessions/in-progress");
}
