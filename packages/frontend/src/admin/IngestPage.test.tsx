import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IngestPage } from "./IngestPage.js";
import { renderPage } from "../test/test-utils.js";

const adminMe = {
  sub: "admin-1",
  role: "admin",
  apps: ["reading"],
};

const sampleManifest = {
  id: 42,
  title: "Test Wind in the Willows",
  author: "Kenneth Grahame",
  source: "Project Gutenberg #289",
  source_url: "https://example.test/289-0.txt",
  year_published: 1908,
  genre: "fiction",
  subgenre: "classic",
  difficulty: 2,
  exam_boards: ["GL"],
  word_count_target: 90,
  reading_level: "Year 5-6",
  themes: ["nature"],
  question_types_suitable: ["inference"],
  extract: {
    start_phrase: "The Mole",
    end_phrase: "his coat.",
    approximate_words: 90,
  },
};

describe("<IngestPage />", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("lists manifests and triggers a run", async () => {
    const triggered: Array<{ url: string; body: unknown }> = [];

    const successJob = {
      id: "11111111-1111-4111-8111-111111111111",
      passage_manifest_id: 42,
      triggered_by_user_id: 1,
      status: "completed",
      questions_generated: 4,
      questions_failed: 0,
      started_at: "2026-04-16T10:00:00.000Z",
      completed_at: "2026-04-16T10:00:05.000Z",
      error_log: null,
    };

    global.fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/auth/me")) {
        return new Response(JSON.stringify(adminMe), { status: 200 });
      }
      if (url.endsWith("/api/admin/ingest/manifests")) {
        return new Response(JSON.stringify({ manifests: [sampleManifest] }), {
          status: 200,
        });
      }
      if (url.includes("/api/admin/ingest/jobs") && method === "GET") {
        return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
      }
      if (url.endsWith("/api/admin/ingest/42") && method === "POST") {
        triggered.push({
          url,
          body: init?.body ? JSON.parse(init.body as string) : null,
        });
        return new Response(
          JSON.stringify({
            job: successJob,
            passage_id: "p1",
            passage_version: 1,
          }),
          { status: 202 },
        );
      }
      return new Response(null, { status: 404 });
    };

    renderPage(<IngestPage />);

    expect(
      await screen.findByText(/Test Wind in the Willows/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Kenneth Grahame/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /run ingest/i }));

    await waitFor(() => {
      expect(triggered).toHaveLength(1);
    });
    expect(triggered[0].url).toContain("/api/admin/ingest/42");

    // The newly-created job should appear in the recent runs table.
    await waitFor(() =>
      expect(screen.getByText(/completed/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/4 \/ 0/)).toBeInTheDocument();
  });

  it("surfaces trigger errors without nuking the page", async () => {
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/api/auth/me")) {
        return new Response(JSON.stringify(adminMe), { status: 200 });
      }
      if (url.endsWith("/api/admin/ingest/manifests")) {
        return new Response(JSON.stringify({ manifests: [sampleManifest] }), {
          status: 200,
        });
      }
      if (url.includes("/api/admin/ingest/jobs") && method === "GET") {
        return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
      }
      if (url.endsWith("/api/admin/ingest/42") && method === "POST") {
        return new Response(
          JSON.stringify({ error: "LLM not configured" }),
          { status: 500 },
        );
      }
      return new Response(null, { status: 404 });
    };

    renderPage(<IngestPage />);
    await screen.findByText(/Test Wind in the Willows/);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /run ingest/i }));
    await waitFor(() =>
      expect(screen.getByText(/Couldn't trigger ingest/i)).toBeInTheDocument(),
    );
  });
});
