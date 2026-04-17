import {
  LLMError,
  type GenerateOptions,
  type GenerateResult,
  type ILLMClient,
} from "../types.js";
import { postJson } from "./http-json-client.js";

/**
 * Qwen via Alibaba's DashScope OpenAI-compatible endpoint. The API is
 * close to OpenAI's so the request/response shape matches. Default base
 * URL points at the international endpoint; admin can override via
 * base_url if they need the mainland-CN host.
 *
 *   https://dashscope-intl.aliyuncs.com/compatible-mode/v1
 */
interface DashScopeChatRequest {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
}

interface DashScopeChatResponse {
  model: string;
  choices: Array<{ message: { content: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface QwenClientConfig {
  api_key: string;
  /** Default: "qwen-plus". Admin can override for qwen-max, qwen-turbo, etc. */
  model?: string;
  /** Default: DashScope international endpoint. */
  base_url?: string;
}

export class QwenClient implements ILLMClient {
  readonly provider = "qwen" as const;
  readonly model: string;
  private readonly base_url: string;

  constructor(private readonly config: QwenClientConfig) {
    this.model = config.model ?? "qwen-plus";
    this.base_url =
      config.base_url ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const messages: DashScopeChatRequest["messages"] = [];
    if (options.system) messages.push({ role: "system", content: options.system });
    messages.push({ role: "user", content: options.user });

    const body: DashScopeChatRequest = {
      model: this.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      ...(options.json_schema
        ? { response_format: { type: "json_object" } }
        : {}),
    };

    const data = await postJson<DashScopeChatResponse>({
      url: `${this.base_url}/chat/completions`,
      headers: { Authorization: `Bearer ${this.config.api_key}` },
      body,
      provider: "qwen",
      signal: options.signal,
    });

    const content = data.choices[0]?.message.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new LLMError(
        "qwen returned an empty completion",
        "malformed_response",
        "qwen",
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
