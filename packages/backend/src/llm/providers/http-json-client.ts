import { LLMError, type LLMProvider } from "../types.js";

/**
 * Shared HTTP + JSON plumbing for LLM providers. Each provider (Qwen,
 * OpenAI, Anthropic) normally needs the same: POST a JSON body, parse
 * the JSON response, map common HTTP failure modes to LLMError with
 * a stable `code`. Keeping this out of each concrete provider lets us
 * add new ones in ~30 lines each.
 */
export async function postJson<T>(options: {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  provider: LLMProvider;
  signal?: AbortSignal;
  timeout_ms?: number;
}): Promise<T> {
  const { url, headers, body, provider } = options;
  const controller = new AbortController();
  const composedSignal =
    options.signal ?? controller.signal;

  // Default 30s timeout if caller didn't pass one — LLM calls that take
  // longer than this are a signal to tune the prompt, not to wait.
  const timer = options.timeout_ms
    ? setTimeout(() => controller.abort(), options.timeout_ms)
    : setTimeout(() => controller.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: composedSignal,
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === "AbortError") {
      throw new LLMError(
        `${provider} request timed out`,
        "timeout",
        provider,
        true,
      );
    }
    throw new LLMError(
      `${provider} network error: ${(err as Error).message}`,
      "server_error",
      provider,
      true,
    );
  }
  clearTimeout(timer);

  if (res.status === 401 || res.status === 403) {
    throw new LLMError(
      `${provider} rejected credentials`,
      "invalid_api_key",
      provider,
      false,
    );
  }
  if (res.status === 429) {
    throw new LLMError(
      `${provider} rate-limited this request`,
      "rate_limited",
      provider,
      true,
    );
  }
  if (res.status >= 500) {
    throw new LLMError(
      `${provider} server error ${res.status}`,
      "server_error",
      provider,
      true,
    );
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new LLMError(
      `${provider} returned ${res.status}: ${bodyText.slice(0, 300)}`,
      "server_error",
      provider,
      false,
    );
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new LLMError(
      `${provider} returned non-JSON body`,
      "malformed_response",
      provider,
      false,
    );
  }
}
