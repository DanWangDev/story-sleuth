import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App.js";

describe("<App />", () => {
  it("renders the wordmark", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Story\s*Sleuth/);
  });

  it("renders the product tagline", () => {
    render(<App />);
    expect(
      screen.getByText(/Read a passage\. Answer questions\./),
    ).toBeInTheDocument();
  });
});
