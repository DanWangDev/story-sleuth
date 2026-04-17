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
  sub: "admin-1",
  role: "admin",
  apps: ["reading"],
};

function stubLlmConfig() {
  const calls: Call[] = [];
  let config = {
    active_provider: "qwen",
    providers: [
      {
        provider: "qwen",
        model: "qwen2.5-72b-instruct",
        base_url: null,
        api_key_tail: "****abcd",
        updated_at: "2026-04-10T00:00:00.000Z",
      },
      {
        provider: "openai",
        model: null,
        base_url: null,
        api_key_tail: null,
        updated_at: null,
      },
      {
        provider: "anthropic",
        model: null,
        base_url: null,
        api_key_tail: null,
        updated_at: null,
      },
    ],
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
          active_provider?: string;
          providers?: Array<{
            provider: string;
            model?: string;
            api_key?: string;
          }>;
        };
        if (b.active_provider) {
          config = { ...config, active_provider: b.active_provider };
        }
        for (const p of b.providers ?? []) {
          config = {
            ...config,
            providers: config.providers.map((existing) =>
              existing.provider === p.provider
                ? {
                    ...existing,
                    model: p.model ?? existing.model,
                    api_key_tail:
                      typeof p.api_key === "string" && p.api_key.length > 0
                        ? `****${p.api_key.slice(-4)}`
                        : existing.api_key_tail,
                  }
                : existing,
            ),
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

  it("renders one card per provider with masked key tail", async () => {
    stubLlmConfig();
    renderPage(<LlmSettingsPage />);
    expect(await screen.findByText(/LLM settings/i)).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /qwen/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /openai/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /anthropic/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/\*\*\*\*abcd/)).toBeInTheDocument();
  });

  it("saves a new api key via PUT with only the touched provider", async () => {
    const { calls } = stubLlmConfig();
    renderPage(<LlmSettingsPage />);

    await screen.findByRole("heading", { name: /qwen/i });

    const qwenCard = screen
      .getByRole("heading", { name: /qwen/i })
      .closest("section")!;
    expect(qwenCard).toBeTruthy();

    const user = userEvent.setup();
    const keyInputs = qwenCard.querySelectorAll('input[type="password"]');
    await user.type(keyInputs[0] as HTMLInputElement, "sk-new-key-9999");
    const saveBtns = Array.from(
      qwenCard.querySelectorAll("button"),
    ).filter((b) => b.textContent?.match(/save/i));
    await user.click(saveBtns[0] as HTMLButtonElement);

    await waitFor(() => expect(screen.getByText(/^Saved\.$/)).toBeInTheDocument());

    const putCall = calls.find(
      (c) => c.method === "PUT" && c.url.endsWith("/api/admin/settings/llm"),
    );
    expect(putCall).toBeTruthy();
    const sent = putCall!.body as {
      active_provider?: string;
      providers: Array<{ provider: string; api_key?: string }>;
    };
    expect(sent.active_provider).toBeUndefined();
    expect(sent.providers).toHaveLength(1);
    expect(sent.providers[0].provider).toBe("qwen");
    expect(sent.providers[0].api_key).toBe("sk-new-key-9999");
  });

  it("switches active provider via the radio and sends only active_provider", async () => {
    const { calls } = stubLlmConfig();
    renderPage(<LlmSettingsPage />);
    await screen.findByRole("heading", { name: /openai/i });
    const user = userEvent.setup();
    const openaiRadio = screen.getByRole("radio", {
      name: /use openai as active provider/i,
    });
    await user.click(openaiRadio);
    await waitFor(() => {
      const put = calls.find(
        (c) => c.method === "PUT" && c.url.endsWith("/api/admin/settings/llm"),
      );
      expect(put).toBeTruthy();
      const sent = put!.body as {
        active_provider: string;
        providers?: unknown[];
      };
      expect(sent.active_provider).toBe("openai");
      expect(sent.providers).toBeUndefined();
    });
  });
});
