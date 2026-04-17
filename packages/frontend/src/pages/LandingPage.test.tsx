import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LandingPage } from "./LandingPage.js";
import {
  mockAnonymousAuth,
  mockAuthenticatedAs,
  renderPage,
} from "../test/test-utils.js";

describe("<LandingPage />", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("anonymous", () => {
    beforeEach(() => {
      mockAnonymousAuth();
    });

    it("renders wordmark, tagline, and a sign-in button", async () => {
      renderPage(<LandingPage />);
      expect(
        await screen.findByRole("button", { name: /sign in/i }),
      ).toBeInTheDocument();
      expect(screen.getByText(/Read a passage/i)).toBeInTheDocument();
      expect(screen.getByText(/look at it together/i)).toBeInTheDocument();
    });

    it("redirects to /api/auth/login on sign-in click", async () => {
      const assign = vi.fn();
      Object.defineProperty(window, "location", {
        value: {
          ...window.location,
          assign,
          pathname: "/",
          search: "",
        },
        writable: true,
      });

      renderPage(<LandingPage />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: /sign in/i }));
      expect(assign).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/login"),
      );
      expect(assign).toHaveBeenCalledWith(
        expect.stringContaining("return_to=%2F"),
      );
    });
  });

  describe("authenticated", () => {
    it("greets the user and offers a start-session button", async () => {
      mockAuthenticatedAs({ sub: "user-1", display_name: "Dan" });
      renderPage(<LandingPage />);
      expect(await screen.findByText(/Welcome back, Dan/i)).toBeInTheDocument();
      expect(
        await screen.findByRole("button", { name: /start a new session/i }),
      ).toBeInTheDocument();
    });

    it("shows an in-progress resume card when there is one", async () => {
      global.fetch = async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/me")) {
          return new Response(
            JSON.stringify({
              sub: "user-1",
              role: "student",
              apps: ["reading"],
            }),
            { status: 200 },
          );
        }
        if (url.includes("/api/sessions/in-progress")) {
          return new Response(
            JSON.stringify({
              sessions: [
                {
                  id: "11111111-1111-4111-8111-111111111111",
                  user_id: 1,
                  mode: "practice",
                  exam_board: "GL",
                  passage_id: "abc",
                  passage_version: 1,
                  question_ids: [],
                  time_allowed_seconds: null,
                  started_at: "2026-04-16T10:00:00.000Z",
                  ended_at: null,
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(null, { status: 404 });
      };

      renderPage(<LandingPage />);
      expect(await screen.findByText(/In progress/i)).toBeInTheDocument();
      expect(
        await screen.findByRole("button", { name: /continue/i }),
      ).toBeInTheDocument();
    });

    it("shows a friendly error when no content exists for the exam board", async () => {
      const assign = vi.fn();
      Object.defineProperty(window, "location", {
        value: { ...window.location, assign, pathname: "/", search: "" },
        writable: true,
      });

      global.fetch = async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/me")) {
          return new Response(
            JSON.stringify({ sub: "u", role: "student", apps: ["reading"] }),
            { status: 200 },
          );
        }
        if (url.includes("/api/sessions/in-progress")) {
          return new Response(JSON.stringify({ sessions: [] }), { status: 200 });
        }
        if (url.includes("/api/sessions")) {
          return new Response(
            JSON.stringify({ error: "no_content_for_exam_board" }),
            { status: 404 },
          );
        }
        return new Response(null, { status: 404 });
      };

      renderPage(<LandingPage />);
      const user = userEvent.setup();
      const startBtn = await screen.findByRole("button", {
        name: /start a new session/i,
      });
      await user.click(startBtn);

      await waitFor(() =>
        expect(
          screen.getByText(/No content available yet/i),
        ).toBeInTheDocument(),
      );
    });
  });
});
