import { useEffect, useState } from "react";
import {
  getLlmConfig,
  updateLlmConfig,
  type LLMProvider,
  type LlmConfigResponse,
} from "../api/admin.js";
import { ApiError } from "../api/client.js";

/**
 * LLM configuration page. Shows one row per provider (qwen / openai /
 * anthropic). Admin can:
 *   - pick the active provider (radio)
 *   - edit model + base_url for each provider (text fields)
 *   - paste a new api_key — existing key displayed as **** tail only
 *
 * Save is per-row: the admin changes one provider at a time and the
 * UI only sends the fields the admin actually touched. This mirrors
 * the backend's "null/omit = leave unchanged" semantics.
 */
export function LlmSettingsPage(): React.ReactElement {
  const [config, setConfig] = useState<LlmConfigResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getLlmConfig();
        if (!cancelled) setConfig(r);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError
            ? `Couldn't load LLM settings: ${err.message}`
            : "Couldn't load LLM settings.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <p style={{ color: "var(--color-error)" }} role="alert">
        {loadError}
      </p>
    );
  }
  if (!config) {
    return <p style={{ color: "var(--color-ink-muted)" }}>Loading…</p>;
  }

  async function setActive(provider: LLMProvider): Promise<void> {
    const r = await updateLlmConfig({ active_provider: provider });
    setConfig(r);
  }

  async function saveProvider(
    provider: LLMProvider,
    update: { model?: string; base_url?: string; api_key?: string },
  ): Promise<LlmConfigResponse> {
    const r = await updateLlmConfig({
      providers: [
        {
          provider,
          model: update.model,
          base_url: update.base_url,
          api_key: update.api_key,
        },
      ],
    });
    setConfig(r);
    return r;
  }

  return (
    <div>
      <h1
        className="font-serif text-3xl font-bold mb-2"
        style={{ color: "var(--color-ink)" }}
      >
        LLM settings
      </h1>
      <p
        className="font-serif mb-8 max-w-[60ch]"
        style={{ color: "var(--color-ink-muted)" }}
      >
        Configure which LLM generates questions and coaching explanations.
        API keys are encrypted at rest and only shown as the last four
        characters after saving.
      </p>

      <div className="space-y-6">
        {config.providers.map((p) => (
          <ProviderCard
            key={p.provider}
            provider={p}
            isActive={config.active_provider === p.provider}
            onActivate={() => setActive(p.provider)}
            onSave={(u) => saveProvider(p.provider, u)}
          />
        ))}
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  isActive,
  onActivate,
  onSave,
}: {
  provider: {
    provider: LLMProvider;
    model: string | null;
    base_url: string | null;
    api_key_tail: string | null;
    updated_at: string | null;
  };
  isActive: boolean;
  onActivate: () => Promise<void>;
  onSave: (u: {
    model?: string;
    base_url?: string;
    api_key?: string;
  }) => Promise<LlmConfigResponse>;
}): React.ReactElement {
  const [model, setModel] = useState(provider.model ?? "");
  const [baseUrl, setBaseUrl] = useState(provider.base_url ?? "");
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await onSave({
        model: model.trim() || undefined,
        base_url: baseUrl.trim() || undefined,
        api_key: newKey.trim() || undefined,
      });
      setNewKey("");
      setSaved(true);
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : "Couldn't save settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="rounded-md border p-6"
      style={{
        background: "var(--color-paper)",
        borderColor: "var(--color-rule)",
      }}
      aria-labelledby={`provider-${provider.provider}-title`}
    >
      <div className="flex items-center justify-between mb-4">
        <h2
          id={`provider-${provider.provider}-title`}
          className="font-serif text-xl font-semibold capitalize"
          style={{ color: "var(--color-ink)" }}
        >
          {provider.provider}
        </h2>
        <label className="flex items-center gap-2 text-sm font-sans">
          <input
            type="radio"
            name="active_provider"
            checked={isActive}
            onChange={() => {
              void onActivate();
            }}
            aria-label={`Use ${provider.provider} as active provider`}
          />
          <span style={{ color: "var(--color-ink)" }}>
            {isActive ? "Active" : "Set as active"}
          </span>
        </label>
      </div>

      <div className="grid gap-4">
        <Field label="Model">
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. qwen2.5-72b-instruct"
            className="w-full rounded-md border px-3 py-2 font-mono text-sm"
            style={{
              borderColor: "var(--color-rule)",
              background: "var(--color-page)",
            }}
          />
        </Field>
        <Field label="Base URL (optional)">
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="Leave blank for provider default"
            className="w-full rounded-md border px-3 py-2 font-mono text-sm"
            style={{
              borderColor: "var(--color-rule)",
              background: "var(--color-page)",
            }}
          />
        </Field>
        <Field label="API key">
          <div className="space-y-1">
            {provider.api_key_tail && (
              <div
                className="text-xs font-mono"
                style={{ color: "var(--color-ink-muted)" }}
              >
                Current: {provider.api_key_tail}
              </div>
            )}
            <input
              type="password"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder={
                provider.api_key_tail
                  ? "Paste a new key to replace the stored one"
                  : "Paste the provider API key"
              }
              autoComplete="off"
              className="w-full rounded-md border px-3 py-2 font-mono text-sm"
              style={{
                borderColor: "var(--color-rule)",
                background: "var(--color-page)",
              }}
            />
          </div>
        </Field>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 font-sans font-semibold rounded-md"
          style={{
            minHeight: 40,
            background: "var(--color-accent)",
            color: "var(--color-paper)",
            opacity: saving ? 0.7 : 1,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span className="text-sm" style={{ color: "var(--color-accent)" }}>
            Saved.
          </span>
        )}
        {saveError && (
          <span
            className="text-sm"
            style={{ color: "var(--color-error)" }}
            role="alert"
          >
            {saveError}
          </span>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="block">
      <span
        className="block text-xs font-sans font-semibold uppercase tracking-wide mb-1"
        style={{ color: "var(--color-ink-muted)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
