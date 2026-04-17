import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { AdminGuard } from "./AdminGuard.js";
import {
  mockAnonymousAuth,
  mockAuthenticatedAs,
  renderPage,
} from "../test/test-utils.js";

afterEach(() => vi.restoreAllMocks());

function Protected(): React.ReactElement {
  return <div>admin-content</div>;
}

describe("AdminGuard", () => {
  it("redirects anonymous users to /", async () => {
    mockAnonymousAuth();
    renderPage(
      <AdminGuard>
        <Protected />
      </AdminGuard>,
      { initialEntries: ["/admin/llm"], path: "/admin/llm" },
    );
    await waitFor(() => {
      expect(screen.getByTestId("nav-destination")).toBeInTheDocument();
    });
    expect(screen.queryByText("admin-content")).not.toBeInTheDocument();
  });

  it("redirects students to /", async () => {
    mockAuthenticatedAs({ sub: "u1", role: "student" });
    renderPage(
      <AdminGuard>
        <Protected />
      </AdminGuard>,
      { initialEntries: ["/admin/llm"], path: "/admin/llm" },
    );
    await waitFor(() => {
      expect(screen.getByTestId("nav-destination")).toBeInTheDocument();
    });
    expect(screen.queryByText("admin-content")).not.toBeInTheDocument();
  });

  it("renders children for admins", async () => {
    mockAuthenticatedAs({ sub: "u1", role: "admin" });
    renderPage(
      <AdminGuard>
        <Protected />
      </AdminGuard>,
      { initialEntries: ["/admin/llm"], path: "/admin/llm" },
    );
    await waitFor(() => {
      expect(screen.getByText("admin-content")).toBeInTheDocument();
    });
  });
});
