import { LLMError, type ILLMClient, type LLMProvider } from "./types.js";
import { OpenAIClient } from "./providers/openai.js";
import { AnthropicClient } from "./providers/anthropic.js";
import type { AdminSettingsRepository } from "../repositories/interfaces/admin-settings-repository.js";

/**
 * Admin-settings key conventions. One global LLM config.
 */
export const LLM_SETTING_KEYS = {
  provider: "llm.provider",
  model: "llm.model",
  api_key: "llm.api_key",
  base_url: "llm.base_url",
  providers: "llm.providers",
} as const;

/**
 * Built-in provider list used as a fallback when the DB has no providers
 * configured. This also serves as the seed for first boot.
 */
export const BUILTIN_PROVIDERS = [
  { id: "qwen", name: "Qwen (DashScope)", api_type: "openai-compatible" as const },
  { id: "openai", name: "OpenAI", api_type: "openai-compatible" as const },
  { id: "anthropic", name: "Anthropic", api_type: "anthropic" as const },
  { id: "deepseek", name: "DeepSeek", api_type: "openai-compatible" as const },
  { id: "kimi", name: "Kimi (Moonshot)", api_type: "openai-compatible" as const },
  { id: "glm", name: "GLM (Zhipu)", api_type: "openai-compatible" as const },
];

export interface ProviderDefinition {
  id: string;
  name: string;
  api_type: "openai-compatible" | "anthropic";
}

/**
 * Hardcoded defaults for well-known providers. These are applied when the
 * admin hasn't configured a model or base_url. Providers not listed here
 * fall back to the OpenAIClient constructor defaults.
 */
const DEFAULTS: Record<string, { model: string; base_url: string }> = {
  qwen: {
    model: "qwen-plus",
    base_url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  openai: {
    model: "gpt-4o-mini",
    base_url: "https://api.openai.com/v1",
  },
};

export function isValidProvider(
  x: string,
  providers: ProviderDefinition[],
): boolean {
  return providers.some((p) => p.id === x);
}

/**
 * Reads the providers list from settings. Falls back to BUILTIN_PROVIDERS
 * if nothing is stored in the DB.
 */
async function loadProviders(
  settings: AdminSettingsRepository,
): Promise<ProviderDefinition[]> {
  const row = await settings.get(LLM_SETTING_KEYS.providers);
  if (!row) return BUILTIN_PROVIDERS;
  try {
    const parsed = JSON.parse(row.value);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as ProviderDefinition[];
    return BUILTIN_PROVIDERS;
  } catch {
    return BUILTIN_PROVIDERS;
  }
}

export interface ClientConfig {
  provider: string;
  model?: string;
  base_url?: string;
  api_key: string;
}

/**
 * Builds an ILLMClient from admin-configured settings. Re-reads every
 * call so a config change in the admin UI takes effect immediately.
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
    const providers = await loadProviders(this.settings);

    if (!provider || !isValidProvider(provider, providers)) {
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
        "no api_key configured — paste one in admin settings",
        "invalid_api_key",
        provider,
        false,
      );
    }

    return this.buildClientFromConfig({ provider, api_key, model, base_url });
  }

  /**
   * Build a client directly from explicit config values — no DB reads.
   * Used by the test-connection endpoint so it doesn't need to
   * temporarily overwrite the stored settings.
   */
  async buildClientFromConfig(
    config: ClientConfig,
  ): Promise<ILLMClient> {
    const { provider, api_key, model, base_url } = config;

    const providers = await loadProviders(this.settings);
    if (!isValidProvider(provider, providers)) {
      throw new LLMError(
        `unknown provider: ${provider}`,
        "provider_unknown",
        "unknown",
        false,
      );
    }

    if (!api_key) {
      throw new LLMError(
        "no api_key provided",
        "invalid_api_key",
        provider,
        false,
      );
    }

    const def = providers.find((p) => p.id === provider);
    const api_type = def?.api_type ?? "openai-compatible";

    if (api_type === "anthropic") {
      return new AnthropicClient({ api_key, model, base_url });
    }

    const defaults = DEFAULTS[provider];
    return new OpenAIClient({
      provider: provider as LLMProvider,
      api_key,
      model: model ?? defaults?.model,
      base_url: base_url ?? defaults?.base_url,
    });
  }
}
