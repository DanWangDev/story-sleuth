import {
  LLMError,
  type GenerateOptions,
  type GenerateResult,
  type ILLMClient,
  type LLMProvider,
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
  choices: Array<{
    message: {
      content: string;
      /** DeepSeek / other reasoning models put chain-of-thought here. */
      reasoning_content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    /** Tokens used by reasoning (DeepSeek). */
    reasoning_tokens?: number;
  };
}

export interface OpenAIClientConfig {
  /** Which provider this instance represents in error messages and the provider property. */
  provider: LLMProvider;
  api_key: string;
  /** Default: "gpt-4o-mini". Admin can override per provider. */
  model?: string;
  /** Default: "https://api.openai.com/v1". Admin can override for gateways/alternate endpoints. */
  base_url?: string;
}

export class OpenAIClient implements ILLMClient {
  readonly provider: LLMProvider;
  readonly model: string;
  private readonly base_url: string;

  constructor(private readonly config: OpenAIClientConfig) {
    this.provider = config.provider;
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
      provider: this.provider,
      signal: options.signal,
    });

    const choice = data.choices[0];
    if (!choice) {
      throw new LLMError(
        `${this.provider} returned no choices — check the model name is valid for this provider`,
        "malformed_response",
        this.provider,
        false,
      );
    }
    const msg = choice.message;
    let content: string | undefined = typeof msg?.content === "string" ? msg.content : undefined;

    // DeepSeek and other reasoning models may produce reasoning_content
    // but empty content when max_tokens is too low — the model spent all
    // its tokens thinking and never output the final answer.
    if (!content && msg?.reasoning_content) {
      throw new LLMError(
        `${this.provider} reasoning exhausted tokens before producing output. `
        + `Increase max_tokens (current call used ${data.usage?.completion_tokens ?? "?"} tokens). `
        + `Reasoning preview: "${msg.reasoning_content.slice(0, 100)}..."`,
        "malformed_response",
        this.provider,
        true, // retryable with higher token count
      );
    }

    if (!content) {
      const preview = JSON.stringify(choice).slice(0, 200);
      throw new LLMError(
        `${this.provider} returned an empty completion. Raw response: ${preview}`,
        "malformed_response",
        this.provider,
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
