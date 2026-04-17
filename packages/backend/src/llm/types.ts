/**
 * LLM provider types. The surface area is intentionally small — story-
 * sleuth uses the LLM in exactly two places (question generation and
 * walk-through coaching), and both reduce to "give me text back, in
 * some structured shape, for this prompt." No streaming, no tool use,
 * no multi-turn; we can add those later if the product grows into
 * them, but introducing them now is YAGNI.
 */

/**
 * The subset of providers the LLMFactory knows how to construct. Adding
 * a provider means: a new string literal here, a new env var for its
 * API key, a new concrete implementation, and one entry in the factory
 * switch. Deliberately narrow so a typo in the admin UI can't silently
 * fall through.
 */
export const LLM_PROVIDERS = ["qwen", "openai", "anthropic"] as const;
export type LLMProvider = (typeof LLM_PROVIDERS)[number];

export interface GenerateOptions {
  /** Free-form system prompt. */
  system?: string;
  /** User turn (the actual question). */
  user: string;
  /** 0-2 range for most providers; higher = more random. */
  temperature?: number;
  /** Hard cap on response length. */
  max_tokens?: number;
  /**
   * When set, instruct the model to return JSON matching this schema.
   * Implementations SHOULD enforce via the provider's native structured-
   * output mode (OpenAI JSON mode, Anthropic tool_use, etc.) rather
   * than just asking nicely in the system prompt.
   */
  json_schema?: Record<string, unknown>;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  /** Token counts when the provider reports them; for cost attribution. */
  input_tokens?: number;
  output_tokens?: number;
  /** Provider-reported model name (can differ from requested). */
  model: string;
}

export class LLMError extends Error {
  constructor(
    message: string,
    readonly code:
      | "rate_limited"
      | "invalid_api_key"
      | "server_error"
      | "timeout"
      | "malformed_response"
      | "provider_unknown",
    readonly provider: LLMProvider | "unknown",
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

export interface ILLMClient {
  readonly provider: LLMProvider;
  readonly model: string;
  generate(options: GenerateOptions): Promise<GenerateResult>;
}
