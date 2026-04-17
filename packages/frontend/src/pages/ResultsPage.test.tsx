import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { ResultsPage } from "./ResultsPage.js";
import { renderPage } from "../test/test-utils.js";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

const RESULTS_RESPONSE = {
  session: {
    id: SESSION_ID,
    user_id: 1,
    mode: "practice",
    exam_board: "GL",
    passage_id: "p1",
    passage_version: 1,
    question_ids: ["q1", "q2"],
    time_allowed_seconds: null,
    started_at: "2026-04-17T10:00:00.000Z",
    ended_at: "2026-04-17T10:30:00.000Z",
  },
  passage: {
    id: "p1",
    version: 1,
    title: "The River Bank",
    author: "Kenneth Grahame",
    source: "Gutenberg",
    source_url: "https://example.com",
    year_published: 1908,
    genre: "fiction",
    subgenre: "classic",
    exam_boards: ["GL"],
    difficulty: 2,
    reading_level: "Year 5-6",
    word_count: 100,
    themes: [],
    body: "The Mole had been working very hard...",
    status: "published",
    created_at: "2026-04-17T10:00:00.000Z",
    published_at: "2026-04-17T10:00:00.000Z",
  },
  questions: [
    {
      id: "q1",
      passage_id: "p1",
      passage_version: 1,
      text: "Why does Mole stop?",
      question_type: "inference",
      exam_boards: ["GL"],
      difficulty: 2,
      options: [
        {
          letter: "A",
          text: "He finished",
          explanation_if_chosen: "Not quite — he didn't finish.",
        },
        {
          letter: "B",
          text: "He felt spring",
          explanation_if_chosen: "Correct — spring pulled him out.",
        },
        {
          letter: "C",
          text: "He was tired",
          explanation_if_chosen: "Tired IS mentioned but isn't the reason.",
        },
        {
          letter: "D",
          text: "He was angry",
          explanation_if_chosen: "No textual support for this.",
        },
      ],
      correct_option: "B",
      status: "published",
      created_at: "2026-04-17T10:00:00.000Z",
      published_at: "2026-04-17T10:00:00.000Z",
    },
    {
      id: "q2",
      passage_id: "p1",
      passage_version: 1,
      text: "What is scrabbled?",
      question_type: "vocabulary-in-context",
      exam_boards: ["GL"],
      difficulty: 2,
      options: [
        {
          letter: "A",
          text: "Smoothly",
          explanation_if_chosen: "Wrong tone — scrabbled is not smooth.",
        },
        {
          letter: "B",
          text: "With effort",
          explanation_if_chosen: "Correct — it's an effortful, scratching move.",
        },
        {
          letter: "C",
          text: "Silently",
          explanation_if_chosen: "No — scrabbled is noisy.",
        },
        {
          letter: "D",
          text: "Carelessly",
          explanation_if_chosen: "Mole is determined, not careless.",
        },
      ],
      correct_option: "B",
      status: "published",
      created_at: "2026-04-17T10:00:00.000Z",
      published_at: "2026-04-17T10:00:00.000Z",
    },
  ],
  attempts: [
    {
      id: "a1",
      session_id: SESSION_ID,
      user_id: 1,
      question_id: "q1",
      question_type_tag: "inference",
      exam_board: "GL",
      difficulty: 2,
      selected_letter: "B",
      is_correct: true,
      time_taken_ms: 2000,
      created_at: "2026-04-17T10:05:00.000Z",
    },
    {
      id: "a2",
      session_id: SESSION_ID,
      user_id: 1,
      question_id: "q2",
      question_type_tag: "vocabulary-in-context",
      exam_board: "GL",
      difficulty: 2,
      selected_letter: "A",
      is_correct: false,
      time_taken_ms: 4000,
      created_at: "2026-04-17T10:10:00.000Z",
    },
  ],
  summary: {
    total: 2,
    correct: 1,
    accuracy: 0.5,
    per_type_breakdown: [
      { question_type: "inference", total: 1, correct: 1, accuracy: 1 },
      {
        question_type: "vocabulary-in-context",
        total: 1,
        correct: 0,
        accuracy: 0,
      },
    ],
    unanswered_question_ids: [],
  },
};

function routeForResults(): Parameters<typeof renderPage>[1] {
  return {
    path: "/sessions/:id/results",
    initialEntries: [`/sessions/${SESSION_ID}/results`],
  };
}

describe("<ResultsPage />", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(): void {
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/me")) {
        return new Response(
          JSON.stringify({ sub: "u", role: "student", apps: ["reading"] }),
          { status: 200 },
        );
      }
      if (
        url.endsWith(`/api/sessions/${SESSION_ID}/end`) &&
        init?.method === "POST"
      ) {
        return new Response(JSON.stringify(RESULTS_RESPONSE), { status: 200 });
      }
      return new Response(null, { status: 404 });
    };
  }

  it("renders the summary: 1 of 2 correct, 50%", async () => {
    mockFetch();
    renderPage(<ResultsPage />, routeForResults());
    expect(await screen.findByText(/1 of 2/i)).toBeInTheDocument();
    expect(screen.getByText(/50%/i)).toBeInTheDocument();
  });

  it("shows per-type breakdown with per-type tallies", async () => {
    mockFetch();
    renderPage(<ResultsPage />, routeForResults());
    await screen.findByText(/1 of 2/i);
    // The "— 1/1 correct" lines only appear in the summary breakdown,
    // so they uniquely identify the breakdown rows.
    expect(screen.getByText(/1\/1 correct/)).toBeInTheDocument();
    expect(screen.getByText(/0\/1 correct/)).toBeInTheDocument();
    expect(screen.getAllByText(/inference/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/vocabulary in context/i).length,
    ).toBeGreaterThan(0);
  });

  it("marks the correct option as correct and the wrong pick as 'your choice'", async () => {
    mockFetch();
    renderPage(<ResultsPage />, routeForResults());
    await screen.findByText(/1 of 2/i);

    // Q1: correct_option=B, student picked B → "You got this one"
    expect(screen.getByText(/You got this one/i)).toBeInTheDocument();
    // Q2: correct_option=B, student picked A → "Let's look at this together"
    expect(
      screen.getByText(/Let's look at this together/i),
    ).toBeInTheDocument();
    // The wrong-pick marker.
    expect(screen.getByText(/Your choice/i)).toBeInTheDocument();
  });

  it("renders per-option explanations for each question (coaching content)", async () => {
    mockFetch();
    renderPage(<ResultsPage />, routeForResults());
    await screen.findByText(/1 of 2/i);
    expect(
      screen.getByText(/Correct — spring pulled him out/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Wrong tone — scrabbled is not smooth/i),
    ).toBeInTheDocument();
  });
});
