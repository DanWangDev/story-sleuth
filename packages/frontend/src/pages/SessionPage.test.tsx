import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionPage } from "./SessionPage.js";
import { renderPage } from "../test/test-utils.js";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const PASSAGE_ID = "22222222-2222-4222-8222-222222222222";

const ACTIVE_SESSION_RESPONSE = {
  session: {
    id: SESSION_ID,
    user_id: 1,
    mode: "practice" as const,
    exam_board: "GL" as const,
    passage_id: PASSAGE_ID,
    passage_version: 1,
    question_ids: ["q1", "q2"],
    time_allowed_seconds: null,
    started_at: "2026-04-17T10:00:00.000Z",
    ended_at: null,
  },
  passage: {
    id: PASSAGE_ID,
    version: 1,
    title: "Wind in the Willows",
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
    body: "The Mole had been working very hard...\n\nSpring was moving in the air...",
    status: "published",
    created_at: "2026-04-17T10:00:00.000Z",
    published_at: "2026-04-17T10:00:00.000Z",
  },
  questions: [
    {
      id: "q1",
      text: "Why does Mole stop?",
      question_type: "inference",
      exam_boards: ["GL"],
      difficulty: 2,
      options: [
        { letter: "A", text: "He finished" },
        { letter: "B", text: "He felt spring" },
        { letter: "C", text: "He was tired" },
        { letter: "D", text: "He was angry" },
      ],
    },
    {
      id: "q2",
      text: "What is scrabbled?",
      question_type: "vocabulary-in-context",
      exam_boards: ["GL"],
      difficulty: 2,
      options: [
        { letter: "A", text: "Smoothly" },
        { letter: "B", text: "With effort" },
        { letter: "C", text: "Silently" },
        { letter: "D", text: "Carelessly" },
      ],
    },
  ],
  active: true as const,
};

function routeForSession(): Parameters<typeof renderPage>[1] {
  return {
    path: "/sessions/:id",
    initialEntries: [`/sessions/${SESSION_ID}`],
  };
}

describe("<SessionPage />", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders passage title and all questions", async () => {
    global.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/me")) {
        return new Response(
          JSON.stringify({ sub: "u", role: "student", apps: ["reading"] }),
          { status: 200 },
        );
      }
      if (url.includes(`/api/sessions/${SESSION_ID}`)) {
        return new Response(JSON.stringify(ACTIVE_SESSION_RESPONSE), {
          status: 200,
        });
      }
      return new Response(null, { status: 404 });
    };

    renderPage(<SessionPage />, routeForSession());
    expect(
      await screen.findByText(/Wind in the Willows/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Wind in the Willows/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Why does Mole stop/i)).toBeInTheDocument();
    expect(screen.getByText(/What is scrabbled/i)).toBeInTheDocument();
    expect(screen.getByText(/0 of 2 answered/i)).toBeInTheDocument();
  });

  it("does NOT reveal correct answers in the rendered options", async () => {
    global.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/me")) {
        return new Response(
          JSON.stringify({ sub: "u", role: "student", apps: ["reading"] }),
          { status: 200 },
        );
      }
      if (url.includes(`/api/sessions/${SESSION_ID}`)) {
        return new Response(JSON.stringify(ACTIVE_SESSION_RESPONSE), {
          status: 200,
        });
      }
      return new Response(null, { status: 404 });
    };

    const { container } = renderPage(<SessionPage />, routeForSession());
    await screen.findByText(/Why does Mole stop/i);

    // Backend redacts explanation_if_chosen — the UI never receives or
    // renders it on the active path. Belt-and-braces check.
    expect(container.textContent).not.toMatch(/explanation/i);
    expect(container.textContent).not.toMatch(/correct_option/i);
  });

  it("selecting an option enables the submit button", async () => {
    global.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/me")) {
        return new Response(
          JSON.stringify({ sub: "u", role: "student", apps: ["reading"] }),
          { status: 200 },
        );
      }
      if (url.includes(`/api/sessions/${SESSION_ID}`)) {
        return new Response(JSON.stringify(ACTIVE_SESSION_RESPONSE), {
          status: 200,
        });
      }
      return new Response(null, { status: 404 });
    };

    renderPage(<SessionPage />, routeForSession());
    const user = userEvent.setup();

    // Find the first question's "Submit answer" button
    const buttons = await screen.findAllByRole("button", {
      name: /submit answer/i,
    });
    expect(buttons[0]).toBeDisabled();

    await user.click(screen.getAllByLabelText("Option B")[0]!);
    await waitFor(() => {
      const updated = screen.getAllByRole("button", {
        name: /submit answer/i,
      });
      expect(updated[0]).not.toBeDisabled();
    });
  });

  it("submitting an answer POSTs to /answers and locks the card", async () => {
    const answersCalls: unknown[] = [];
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/me")) {
        return new Response(
          JSON.stringify({ sub: "u", role: "student", apps: ["reading"] }),
          { status: 200 },
        );
      }
      if (
        url.endsWith(`/api/sessions/${SESSION_ID}`) &&
        (!init || init.method === undefined || init.method === "GET")
      ) {
        return new Response(JSON.stringify(ACTIVE_SESSION_RESPONSE), {
          status: 200,
        });
      }
      if (url.endsWith(`/api/sessions/${SESSION_ID}/answers`)) {
        answersCalls.push(JSON.parse(String(init!.body)));
        return new Response(
          JSON.stringify({ accepted: true, question_id: "q1" }),
          { status: 200 },
        );
      }
      return new Response(null, { status: 404 });
    };

    renderPage(<SessionPage />, routeForSession());
    const user = userEvent.setup();
    await screen.findByText(/Why does Mole stop/i);

    await user.click(screen.getAllByLabelText("Option B")[0]!);
    const submitBtn = screen.getAllByRole("button", {
      name: /submit answer/i,
    })[0]!;
    await user.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /answer saved/i })[0],
      ).toBeDisabled();
    });
    expect(answersCalls).toHaveLength(1);
    const payload = answersCalls[0] as {
      question_id: string;
      selected_letter: string;
    };
    expect(payload.question_id).toBe("q1");
    expect(payload.selected_letter).toBe("B");
    expect(screen.getByText(/1 of 2 answered/i)).toBeInTheDocument();
  });
});
