import {
  LLMError,
  type GenerateOptions,
  type GenerateResult,
  type ILLMClient,
} from "../types.js";
import { postJson } from "./http-json-client.js";

interface OpenAIChatRequest {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
}

interface OpenAIChatResponse {
  model: string;
  choices: Array<{ message: { content: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface OpenAIClientConfig {
  api_key: string;
  /** Default "gpt-4o-mini" — inexpensive, solid on instruction-following. */
  model?: string;
  /** Override for Azure OpenAI or gateways. */
  base_url?: string;
}

export class OpenAIClient implements ILLMClient {
  readonly provider = "openai" as const;
  readonly model: string;
  private readonly base_url: string;

  constructor(private readonly config: OpenAIClientConfig) {
    this.model = config.model ?? "gpt-4o-mini";
    this.base_url = config.base_url ?? "https://api.openai.com/v1";
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const messages: OpenAIChatRequest["messages"] = [];
    if (options.system) messages.push({ role: "system", content: options.system });
    messages.push({ role: "user", content: options.user });

    const body: OpenAIChatRequest = {
      model: this.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      ...(options.json_schema ? { response_format: { type: "json_object" } } : {}),
    };

    const data = await postJson<OpenAIChatResponse>({
      url: `${this.base_url}/chat/completions`,
      headers: { Authorization: `Bearer ${this.config.api_key}` },
      body,
      provider: "openai",
      signal: options.signal,
    });

    const content = data.choices[0]?.message.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new LLMError(
        "openai returned an empty completion",
        "malformed_response",
        "openai",
        false,
      );
    }
    return {
      text: content,
      input_tokens: data.usage?.prompt_tokens,
      output_tokens: data.usage?.completion_tokens,
      model: data.model,
    };
  }
}
