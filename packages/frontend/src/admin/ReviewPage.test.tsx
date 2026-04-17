import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewPage } from "./ReviewPage.js";
import { renderPage } from "../test/test-utils.js";

const adminMe = {
  sub: "admin-1",
  role: "admin",
  apps: ["reading"],
};

const passage = {
  id: "p1111111-1111-4111-8111-111111111111",
  version: 1,
  title: "Sample Passage",
  author: "Sample Author",
  source: "test",
  source_url: "https://example.test",
  year_published: 1900,
  genre: "fiction",
  subgenre: "classic",
  exam_boards: ["GL"],
  difficulty: 2,
  reading_level: "Year 5-6",
  word_count: 120,
  themes: ["nature"],
  body: "Once upon a time there was a test.",
  status: "pending_review",
  created_at: "2026-04-16T10:00:00.000Z",
  published_at: null,
};

const question = {
  id: "q1111111-1111-4111-8111-111111111111",
  passage_id: passage.id,
  passage_version: passage.version,
  text: "Why did the Mole stop cleaning?",
  question_type: "inference",
  exam_boards: ["GL"],
  difficulty: 2,
  options: [
    { letter: "A", text: "He finished", explanation_if_chosen: "not quite" },
    {
      letter: "B",
      text: "Spring called him",
      explanation_if_chosen: "right",
    },
    { letter: "C", text: "He was angry", explanation_if_chosen: "no" },
    { letter: "D", text: "He was tired", explanation_if_chosen: "partial" },
  ],
  correct_option: "B",
  status: "pending_review",
  created_at: "2026-04-16T10:00:00.000Z",
  published_at: null,
};

describe("<ReviewPage />", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("lists pending passages and publishes one", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    let pending = [passage];

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method });

      if (url.includes("/api/auth/me")) {
        return new Response(JSON.stringify(adminMe), { status: 200 });
      }
      if (url.endsWith("/api/admin/content/passages/pending")) {
        return new Response(JSON.stringify({ passages: pending }), {
          status: 200,
        });
      }
      if (
        url.endsWith(
          `/api/admin/content/passages/${passage.id}/${passage.version}/status`,
        ) &&
        method === "POST"
      ) {
        pending = [];
        return new Response(
          JSON.stringify({ passage: { ...passage, status: "published" } }),
          { status: 200 },
        );
      }
      return new Response(null, { status: 404 });
    };

    renderPage(<ReviewPage />);
    expect(await screen.findByText("Sample Passage")).toBeInTheDocument();

    const user = userEvent.setup();
    const publishBtn = screen.getAllByRole("button", { name: /publish/i })[0];
    await user.click(publishBtn);

    await waitFor(() =>
      expect(
        screen.getByText(/Queue is empty — run an ingest to populate it\./),
      ).toBeInTheDocument(),
    );
    expect(
      calls.some(
        (c) =>
          c.method === "POST" &&
          c.url.endsWith(
            `/api/admin/content/passages/${passage.id}/${passage.version}/status`,
          ),
      ),
    ).toBe(true);
  });

  it("expands a passage to show its questions", async () => {
    global.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/me")) {
        return new Response(JSON.stringify(adminMe), { status: 200 });
      }
      if (url.endsWith("/api/admin/content/passages/pending")) {
        return new Response(JSON.stringify({ passages: [passage] }), {
          status: 200,
        });
      }
      if (
        url.endsWith(
          `/api/admin/content/questions/by-passage/${passage.id}/${passage.version}`,
        )
      ) {
        return new Response(JSON.stringify({ questions: [question] }), {
          status: 200,
        });
      }
      return new Response(null, { status: 404 });
    };

    renderPage(<ReviewPage />);
    await screen.findByText("Sample Passage");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /review/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/Why did the Mole stop cleaning\?/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Spring called him/)).toBeInTheDocument();
    expect(screen.getByText(/← correct/)).toBeInTheDocument();
  });
});
