import { LLM_PROVIDERS, LLMError, type ILLMClient, type LLMProvider } from "./types.js";
import { QwenClient } from "./providers/qwen.js";
import { OpenAIClient } from "./providers/openai.js";
import { AnthropicClient } from "./providers/anthropic.js";
import type { AdminSettingsRepository } from "../repositories/interfaces/admin-settings-repository.js";

/**
 * Admin-settings key conventions. One global LLM config — switching
 * providers replaces the old credentials (no per-provider storage).
 */
export const LLM_SETTING_KEYS = {
  provider: "llm.provider",
  model: "llm.model",
  api_key: "llm.api_key",
  base_url: "llm.base_url",
} as const;

export function isValidProvider(x: string): x is LLMProvider {
  return (LLM_PROVIDERS as readonly string[]).includes(x);
}

/**
 * Builds an ILLMClient from admin-configured settings. Re-reads every
 * call so a config change in the admin UI takes effect on the next
 * generation without a server restart.
 *
 * Throws LLMError("provider_unknown") if no provider is configured or
 * if the configured provider has no API key — the caller handles this
 * gracefully (usually by surfacing "content pipeline requires LLM
 * setup" to the admin).
 */
export class LLMFactory {
  constructor(private readonly settings: AdminSettingsRepository) {}

  async buildClient(): Promise<ILLMClient> {
    const keys = [
      LLM_SETTING_KEYS.provider,
      LLM_SETTING_KEYS.model,
      LLM_SETTING_KEYS.api_key,
      LLM_SETTING_KEYS.base_url,
    ];
    const bundle = await this.settings.getMany(keys);

    const provider = bundle.get(LLM_SETTING_KEYS.provider)?.value;
    if (!provider || !isValidProvider(provider)) {
      throw new LLMError(
        "no LLM provider configured — set llm.provider in admin settings",
        "provider_unknown",
        "unknown",
        false,
      );
    }

    const api_key = bundle.get(LLM_SETTING_KEYS.api_key)?.value;
    const model = bundle.get(LLM_SETTING_KEYS.model)?.value;
    const base_url = bundle.get(LLM_SETTING_KEYS.base_url)?.value;

    if (!api_key) {
      throw new LLMError(
        `no api_key configured — paste one in admin settings`,
        "invalid_api_key",
        provider,
        false,
      );
    }

    switch (provider) {
      case "qwen":
        return new QwenClient({ api_key, model, base_url });
      case "openai":
        return new OpenAIClient({ api_key, model, base_url });
      case "anthropic":
        return new AnthropicClient({ api_key, model, base_url });
    }
  }
}
