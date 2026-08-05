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

const builtinProviders = [
  { id: "qwen", name: "Qwen (DashScope)", api_type: "openai-compatible" },
  { id: "openai", name: "OpenAI", api_type: "openai-compatible" },
  { id: "anthropic", name: "Anthropic", api_type: "anthropic" },
];

function stubApi() {
  const calls: Call[] = [];
  let config = {
    provider: "qwen",
    model: "qwen2.5-72b-instruct",
    base_url: null,
    api_key_tail: "****abcd",
    updated_at: "2026-04-10T00:00:00.000Z",
  };
  let providers = [...builtinProviders];

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
    if (url.endsWith("/api/admin/settings/llm/providers")) {
      if (method === "PUT" && body) {
        providers = (body as { providers: typeof providers }).providers;
      }
      return new Response(JSON.stringify({ providers }), { status: 200 });
    }
    if (url.endsWith("/api/admin/settings/llm/test")) {
      return new Response(
        JSON.stringify({ success: true, model: "qwen-plus", latency_ms: 342 }),
        { status: 200 },
      );
    }
    if (url.endsWith("/api/admin/settings/llm")) {
      if (method === "PUT" && body) {
        const b = body as {
          provider?: string;
          model?: string;
          api_key?: string;
        };
        if (b.provider !== undefined) config = { ...config, provider: b.provider };
        if (b.model !== undefined) config = { ...config, model: b.model };
        if (typeof b.api_key === "string" && b.api_key.length > 0) {
          config = { ...config, api_key_tail: `****${b.api_key.slice(-4)}` };
        }
      }
      return new Response(JSON.stringify(config), { status: 200 });
    }
    return new Response(null, { status: 404 });
  };

  return { calls, getConfig: () => config, getProviders: () => providers };
}

describe("<LlmSettingsPage />", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders provider dropdown populated from API", async () => {
    stubApi();
    renderPage(<LlmSettingsPage />);
    expect(await screen.findByText(/LLM settings/i)).toBeInTheDocument();
    // Provider dropdown shows providers from API.
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(screen.getAllByText("Qwen (DashScope)")).toHaveLength(2); // dropdown + provider list
    expect(screen.getAllByText("OpenAI")).toHaveLength(2);
    // Masked key tail is shown.
    expect(screen.getByText(/\*\*\*\*abcd/)).toBeInTheDocument();
  });

  it("saves config and shows confirmation", async () => {
    stubApi();
    renderPage(<LlmSettingsPage />);
    await screen.findByText(/LLM settings/i);

    const user = userEvent.setup();
    const keyInput = screen.getByPlaceholderText(/Paste a new key/);
    await user.type(keyInput, "sk-new-key-9999");
    const saveBtn = screen.getByRole("button", { name: /^Save$/ });
    await user.click(saveBtn);

    await waitFor(() =>
      expect(screen.getByText(/^Saved\.$/)).toBeInTheDocument(),
    );
  });

  it("shows test connection result", async () => {
    stubApi();
    renderPage(<LlmSettingsPage />);
    await screen.findByText(/LLM settings/i);

    const user = userEvent.setup();
    const testBtn = screen.getByRole("button", { name: /test connection/i });
    await user.click(testBtn);

    await waitFor(() =>
      expect(screen.getByText(/Connected to qwen-plus in 342ms/)).toBeInTheDocument(),
    );
  });

  it("shows provider manager when Manage is clicked", async () => {
    stubApi();
    renderPage(<LlmSettingsPage />);
    await screen.findByText(/LLM settings/i);

    const user = userEvent.setup();
    const manageBtn = screen.getByRole("button", { name: /manage/i });
    await user.click(manageBtn);

    // Add provider form should appear.
    expect(screen.getByPlaceholderText("e.g. deepseek")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. DeepSeek")).toBeInTheDocument();
  });
});
