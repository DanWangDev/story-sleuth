import {
  MemoryRouter,
  Route,
  Routes,
  type MemoryRouterProps,
} from "react-router-dom";
import { render, type RenderResult } from "@testing-library/react";
import { AuthProvider } from "../auth/AuthContext.js";

/**
 * Render a page inside a MemoryRouter + AuthProvider so it can use
 * route params and hook into auth state without tripping over
 * createBrowserRouter in a jsdom environment.
 */
export interface RenderPageOptions {
  initialEntries?: MemoryRouterProps["initialEntries"];
  /** Route pattern for the page (e.g. "/sessions/:id"). Defaults to "/". */
  path?: string;
}

export function renderPage(
  ui: React.ReactElement,
  options: RenderPageOptions = {},
): RenderResult {
  const { initialEntries = ["/"], path = "/" } = options;
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="*" element={<div data-testid="nav-destination" />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

/**
 * Stub global.fetch with a sequence of responses — one per call in
 * order. Each response can be either a { status, body } object (JSON
 * body, auto-serialised) or a pre-built Response.
 */
export function mockFetchSequence(
  responses: Array<{ status: number; body?: unknown } | Response>,
): void {
  let call = 0;
  global.fetch = async () => {
    const next = responses[call++] ?? { status: 404, body: null };
    if (next instanceof Response) return next;
    return new Response(next.body == null ? null : JSON.stringify(next.body), {
      status: next.status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

/**
 * Stub fetch such that GET /api/auth/me returns a 401 (anonymous) and
 * everything else returns 404. Use for tests that should render the
 * logged-out state.
 */
export function mockAnonymousAuth(): void {
  global.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/auth/me")) {
      return new Response(null, { status: 401 });
    }
    return new Response(null, { status: 404 });
  };
}

/** As above but /api/auth/me returns the given user. */
export function mockAuthenticatedAs(user: {
  sub: string;
  role?: "student" | "parent" | "admin";
  display_name?: string;
  apps?: string[];
}): (url: string, init?: RequestInit) => Response {
  const handlers: Array<{
    match: (url: string, init?: RequestInit) => boolean;
    respond: () => Response;
  }> = [
    {
      match: (url) => url.includes("/api/auth/me"),
      respond: () =>
        new Response(
          JSON.stringify({
            sub: user.sub,
            role: user.role ?? "student",
            display_name: user.display_name,
            apps: user.apps ?? ["reading"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    },
  ];

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const h of handlers) {
      if (h.match(url, init)) return h.respond();
    }
    return new Response(JSON.stringify({ sessions: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  return (url, init) => {
    for (const h of handlers) if (h.match(url, init)) return h.respond();
    return new Response(null, { status: 404 });
  };
}
