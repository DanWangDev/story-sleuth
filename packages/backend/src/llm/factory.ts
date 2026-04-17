import { LLM_PROVIDERS, LLMError, type ILLMClient, type LLMProvider } from "./types.js";
import { QwenClient } from "./providers/qwen.js";
import { OpenAIClient } from "./providers/openai.js";
import { AnthropicClient } from "./providers/anthropic.js";
import type { AdminSettingsRepository } from "../repositories/interfaces/admin-settings-repository.js";

/**
 * Admin-settings key conventions. Model and api_key are per-provider so
 * switching providers doesn't discard the other's config.
 */
export const LLM_SETTING_KEYS = {
  active_provider: "llm.active_provider",
  model: (p: LLMProvider) => `llm.${p}.model`,
  api_key: (p: LLMProvider) => `llm.${p}.api_key`,
  base_url: (p: LLMProvider) => `llm.${p}.base_url`,
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
    const active = await this.settings.get(LLM_SETTING_KEYS.active_provider);
    if (!active || !isValidProvider(active.value)) {
      throw new LLMError(
        "no active LLM provider configured — set llm.active_provider in admin settings",
        "provider_unknown",
        "unknown",
        false,
      );
    }
    const provider = active.value;

    const needed = [
      LLM_SETTING_KEYS.api_key(provider),
      LLM_SETTING_KEYS.model(provider),
      LLM_SETTING_KEYS.base_url(provider),
    ];
    const bundle = await this.settings.getMany(needed);
    const api_key = bundle.get(LLM_SETTING_KEYS.api_key(provider))?.value;
    const model = bundle.get(LLM_SETTING_KEYS.model(provider))?.value;
    const base_url = bundle.get(LLM_SETTING_KEYS.base_url(provider))?.value;

    if (!api_key) {
      throw new LLMError(
        `provider ${provider} is active but has no api_key configured`,
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
