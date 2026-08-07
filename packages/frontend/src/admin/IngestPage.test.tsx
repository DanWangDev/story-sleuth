import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { IngestPage } from "./IngestPage.js";
import { renderPage } from "../test/test-utils.js";

const adminMe = {
  success: true,
  data: {
    sub: "admin-1",
    role: "admin",
    apps: ["story-sleuth"],
  },
};

function stubApi() {
  global.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/auth/me")) {
      return new Response(JSON.stringify(adminMe), { status: 200 });
    }
    if (url.includes("/api/admin/ingest/jobs")) {
      return new Response(
        JSON.stringify({
          jobs: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              passage_manifest_id: 42,
              status: "completed",
              questions_generated: 4,
              questions_failed: 0,
              started_at: "2026-04-16T11:00:00.000Z",
              completed_at: "2026-04-16T11:00:30.000Z",
              error_log: null,
              triggered_by_user_id: 1,
            },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response(null, { status: 404 });
  };
}

describe("<IngestPage />", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the CTA to Add Passage and the recent runs table", async () => {
    stubApi();
    renderPage(<IngestPage />);
    // CTA to Add Passage
    expect(await screen.findByText(/Ingest runs/i)).toBeInTheDocument();
    expect(screen.getByText(/Add passage/i)).toBeInTheDocument();
    // Recent runs table — "completed" appears in both filter tab and status pill
    await waitFor(() =>
      expect(screen.getAllByText(/completed/i).length).toBeGreaterThanOrEqual(2),
    );
    expect(screen.getByText(/4 \/ 0/)).toBeInTheDocument();
  });

  it("shows empty state when no jobs", async () => {
    global.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/me")) {
        return new Response(JSON.stringify(adminMe), { status: 200 });
      }
      if (url.includes("/api/admin/ingest/jobs")) {
        return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
      }
      return new Response(null, { status: 404 });
    };
    renderPage(<IngestPage />);
    await screen.findByText(/Ingest runs/i);
    expect(screen.getByText(/No runs yet/)).toBeInTheDocument();
  });
});
