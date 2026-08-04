import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LlmSettingsPage } from "./LlmSettingsPage.js";
import { renderPage } from "../test/test-utils.js";

interface Call {
  url: string;
  method: string;
  body: unknown;
}

const adminMe = {
  success: true,
  data: {
    sub: "admin-1",
    role: "admin",
    apps: ["story-sleuth"],
  },
};

function stubLlmConfig() {
  const calls: Call[] = [];
  let config = {
    provider: "qwen",
    model: "qwen2.5-72b-instruct",
    base_url: null,
    api_key_tail: "****abcd",
    updated_at: "2026-04-10T00:00:00.000Z",
  };

  global.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(init.body as string) : null;
    calls.push({ url, method, body });

    if (url.includes("/api/auth/me")) {
      return new Response(JSON.stringify(adminMe), { status: 200 });
    }
    if (url.endsWith("/api/admin/settings/llm")) {
      if (method === "PUT" && body) {
        const b = body as {
          provider?: string;
          model?: string;
          api_key?: string;
        };
        if (b.provider) {
          config = { ...config, provider: b.provider };
        }
        if (b.model !== undefined) {
          config = { ...config, model: b.model };
        }
        if (typeof b.api_key === "string" && b.api_key.length > 0) {
          config = {
            ...config,
            api_key_tail: `****${b.api_key.slice(-4)}`,
          };
        }
      }
      return new Response(JSON.stringify(config), { status: 200 });
    }
    return new Response(null, { status: 404 });
  };

  return { calls, getConfig: () => config };
}

describe("<LlmSettingsPage />", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a single form with provider dropdown and masked key tail", async () => {
    stubLlmConfig();
    renderPage(<LlmSettingsPage />);
    expect(await screen.findByText(/LLM settings/i)).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /LLM configuration/i }),
    ).toBeInTheDocument();
    // Provider dropdown is present.
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    // Masked key tail is shown.
    expect(screen.getByText(/\*\*\*\*abcd/)).toBeInTheDocument();
    // Model input is pre-filled.
    const modelInput = screen.getByPlaceholderText(
      /qwen2.5-72b-instruct/,
    ) as HTMLInputElement;
    expect(modelInput.value).toBe("qwen2.5-72b-instruct");
  });

  it("saves updated fields via flat PUT", async () => {
    const { calls } = stubLlmConfig();
    renderPage(<LlmSettingsPage />);

    await screen.findByRole("heading", { name: /LLM configuration/i });

    const user = userEvent.setup();
    // Type a new API key.
    const keyInput = screen.getByPlaceholderText(/Paste a new key/);
    await user.type(keyInput, "sk-new-key-9999");
    // Click the single Save button.
    const saveBtn = screen.getByRole("button", { name: /^Save$/ });
    await user.click(saveBtn);

    await waitFor(() =>
      expect(screen.getByText(/^Saved\.$/)).toBeInTheDocument(),
    );

    const putCall = calls.find(
      (c) => c.method === "PUT" && c.url.endsWith("/api/admin/settings/llm"),
    );
    expect(putCall).toBeTruthy();
    const sent = putCall!.body as {
      provider?: string;
      model?: string;
      api_key?: string;
    };
    expect(sent.api_key).toBe("sk-new-key-9999");
  });

  it("sends provider when dropdown changes", async () => {
    const { calls } = stubLlmConfig();
    renderPage(<LlmSettingsPage />);
    await screen.findByRole("heading", { name: /LLM configuration/i });

    const user = userEvent.setup();
    // Change provider to openai.
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "openai");
    // Click Save.
    await user.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() =>
      expect(screen.getByText(/^Saved\.$/)).toBeInTheDocument(),
    );

    const putCall = calls.find(
      (c) => c.method === "PUT" && c.url.endsWith("/api/admin/settings/llm"),
    );
    expect(putCall).toBeTruthy();
    const sent = putCall!.body as { provider: string };
    expect(sent.provider).toBe("openai");
  });
});
