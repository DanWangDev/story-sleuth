import { useEffect, useState } from "react";
import {
  getLlmConfig,
  updateLlmConfig,
  type LLMProvider,
  type LlmConfigResponse,
} from "../api/admin.js";
import { ApiError } from "../api/client.js";

const PROVIDERS: LLMProvider[] = ["qwen", "openai", "anthropic", "deepseek", "kimi", "glm"];

/**
 * Single global LLM configuration. Pick a provider, enter its model
 * + API key, save. Switching providers replaces the old credentials —
 * no per-provider storage.
 */
export function LlmSettingsPage(): React.ReactElement {
  const [config, setConfig] = useState<LlmConfigResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state — initialised once config loads.
  const [provider, setProvider] = useState<LLMProvider>("qwen");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getLlmConfig();
        if (cancelled) return;
        setConfig(r);
        if (r.provider) setProvider(r.provider);
        setModel(r.model ?? "");
        setBaseUrl(r.base_url ?? "");
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

  async function handleSave(): Promise<void> {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const r = await updateLlmConfig({
        provider,
        model: model.trim() || undefined,
        base_url: baseUrl.trim() || undefined,
        api_key: newKey.trim() || undefined,
      });
      setConfig(r);
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

      <section
        className="rounded-md border p-6 max-w-[480px]"
        style={{
          background: "var(--color-paper)",
          borderColor: "var(--color-rule)",
        }}
        aria-labelledby="llm-settings-title"
      >
        <h2
          id="llm-settings-title"
          className="font-serif text-xl font-semibold mb-5"
          style={{ color: "var(--color-ink)" }}
        >
          LLM configuration
        </h2>

        <div className="grid gap-4">
          <Field label="Provider">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as LLMProvider)}
              className="w-full rounded-md border px-3 py-2 font-sans text-sm"
              style={{
                borderColor: "var(--color-rule)",
                background: "var(--color-page)",
                minHeight: 40,
              }}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </Field>

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
              {config.api_key_tail && (
                <div
                  className="text-xs font-mono"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  Current: {config.api_key_tail}
                </div>
              )}
              <input
                type="password"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder={
                  config.api_key_tail
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
    </div>
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
