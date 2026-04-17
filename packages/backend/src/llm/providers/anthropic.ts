import {
  LLMError,
  type GenerateOptions,
  type GenerateResult,
  type ILLMClient,
} from "../types.js";
import { postJson } from "./http-json-client.js";

/**
 * Anthropic's /v1/messages endpoint. Shape differs from OpenAI:
 *   - system prompt is a top-level field, not a message
 *   - messages is user/assistant pairs only
 *   - response is `content: [{ type: 'text', text: '...' }]`
 *   - structured output is typically via tool_use; for Phase 1's
 *     JSON-generation path we rely on prompt discipline + downstream
 *     Zod validation rather than a bespoke tool schema.
 */
interface AnthropicMessagesRequest {
  model: string;
  system?: string;
  messages: Array<{ role: "user"; content: string }>;
  temperature?: number;
  max_tokens: number;
}

interface AnthropicMessagesResponse {
  model: string;
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface AnthropicClientConfig {
  api_key: string;
  /** Default: the latest Sonnet at time of writing. */
  model?: string;
  base_url?: string;
  /** Anthropic API version header. */
  anthropic_version?: string;
}

export class AnthropicClient implements ILLMClient {
  readonly provider = "anthropic" as const;
  readonly model: string;
  private readonly base_url: string;
  private readonly version: string;

  constructor(private readonly config: AnthropicClientConfig) {
    this.model = config.model ?? "claude-sonnet-4-5";
    this.base_url = config.base_url ?? "https://api.anthropic.com/v1";
    this.version = config.anthropic_version ?? "2023-06-01";
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const body: AnthropicMessagesRequest = {
      model: this.model,
      system: options.system,
      messages: [{ role: "user", content: options.user }],
      temperature: options.temperature,
      // Anthropic requires max_tokens; default to a sane cap.
      max_tokens: options.max_tokens ?? 2048,
    };

    const data = await postJson<AnthropicMessagesResponse>({
      url: `${this.base_url}/messages`,
      headers: {
        "x-api-key": this.config.api_key,
        "anthropic-version": this.version,
      },
      body,
      provider: "anthropic",
      signal: options.signal,
    });

    const textBlock = data.content.find((b) => b.type === "text" && b.text);
    const content = textBlock?.text ?? "";
    if (content.length === 0) {
      throw new LLMError(
        "anthropic returned no text content",
        "malformed_response",
        "anthropic",
        false,
      );
    }
    return {
      text: content,
      input_tokens: data.usage?.input_tokens,
      output_tokens: data.usage?.output_tokens,
      model: data.model,
    };
  }
}
