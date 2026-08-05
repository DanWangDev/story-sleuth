import { useEffect, useState } from "react";
import {
  getLlmConfig,
  getProviders,
  updateLlmConfig,
  updateProviders,
  testConnection,
  type LlmConfigResponse,
  type ProviderDefinition,
} from "../api/admin.js";
import { ApiError } from "../api/client.js";

const API_TYPES = [
  { value: "openai-compatible" as const, label: "OpenAI-compatible" },
  { value: "anthropic" as const, label: "Anthropic" },
];

/**
 * LLM settings page. Providers are stored in the database — admin can
 * add, remove, and configure them without code changes.
 */
export function LlmSettingsPage(): React.ReactElement {
  const [config, setConfig] = useState<LlmConfigResponse | null>(null);
  const [providers, setProviders] = useState<ProviderDefinition[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Config form state.
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Test connection state.
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Provider manager state.
  const [showManager, setShowManager] = useState(false);
  const [newProvider, setNewProvider] = useState({
    id: "",
    name: "",
    api_type: "openai-compatible" as "openai-compatible" | "anthropic",
  });
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerSaved, setProviderSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, p] = await Promise.all([getLlmConfig(), getProviders()]);
        if (cancelled) return;
        setConfig(c);
        setProviders(p);
        if (c.provider) setProvider(c.provider);
        setModel(c.model ?? "");
        setBaseUrl(c.base_url ?? "");
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

  async function handleTest(): Promise<void> {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testConnection({
        provider,
        model: model.trim() || undefined,
        base_url: baseUrl.trim() || undefined,
        api_key: newKey.trim() || "",
      });
      setTestResult(
        r.success
          ? {
              success: true,
              message: `Connected to ${r.model} in ${r.latency_ms}ms`,
            }
          : { success: false, message: r.error ?? "Connection failed" },
      );
    } catch (err) {
      setTestResult({
        success: false,
        message:
          err instanceof ApiError ? err.message : "Connection test failed",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveProviders(): Promise<void> {
    setProviderSaving(true);
    setProviderError(null);
    setProviderSaved(false);
    try {
      const updated = await updateProviders(providers);
      setProviders(updated);
      setProviderSaved(true);
      // If the current provider was removed, reset the form.
      if (provider && !updated.some((p) => p.id === provider)) {
        setProvider("");
      }
    } catch (err) {
      setProviderError(
        err instanceof ApiError ? err.message : "Couldn't save providers.",
      );
    } finally {
      setProviderSaving(false);
    }
  }

  function handleAddProvider(): void {
    if (!newProvider.id.trim() || !newProvider.name.trim()) return;
    if (providers.some((p) => p.id === newProvider.id.trim())) {
      setProviderError("A provider with this ID already exists.");
      return;
    }
    setProviders([
      ...providers,
      {
        id: newProvider.id.trim(),
        name: newProvider.name.trim(),
        api_type: newProvider.api_type,
      },
    ]);
    setNewProvider({ id: "", name: "", api_type: "openai-compatible" });
    setProviderError(null);
  }

  function handleRemoveProvider(id: string): void {
    setProviders(providers.filter((p) => p.id !== id));
    setProviderSaved(false);
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
        className="rounded-md border p-6 max-w-[480px] mb-8"
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
              onChange={(e) => {
                setProvider(e.target.value);
                setSaved(false);
              }}
              className="w-full rounded-md border px-3 py-2 font-sans text-sm"
              style={{
                borderColor: "var(--color-rule)",
                background: "var(--color-page)",
                minHeight: 40,
              }}
            >
              <option value="">— Select a provider —</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Model">
            <input
              type="text"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setSaved(false);
              }}
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
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setSaved(false);
              }}
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

        <div className="mt-5 flex items-center gap-3 flex-wrap">
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
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !provider}
            className="px-5 py-2 font-sans font-semibold rounded-md border"
            style={{
              minHeight: 40,
              background: "transparent",
              color: "var(--color-accent)",
              borderColor: "var(--color-accent)",
              opacity: testing ? 0.7 : 1,
              cursor: testing || !provider ? "not-allowed" : "pointer",
            }}
          >
            {testing ? "Testing…" : "Test Connection"}
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

        {testResult && (
          <div
            className="mt-4 rounded-md border px-4 py-3 text-sm"
            style={{
              borderColor: testResult.success
                ? "var(--color-success)"
                : "var(--color-error)",
              background: testResult.success
                ? "#EEF4E3"
                : "var(--color-warning-soft)",
            }}
            role="status"
          >
            {testResult.message}
          </div>
        )}
      </section>

      {/* ── Provider manager ─────────────────────────────────── */}
      <section
        className="rounded-md border p-6 max-w-[480px]"
        style={{
          background: "var(--color-paper)",
          borderColor: "var(--color-rule)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            className="font-serif text-lg font-semibold"
            style={{ color: "var(--color-ink)" }}
          >
            Providers
          </h2>
          <button
            type="button"
            onClick={() => setShowManager(!showManager)}
            className="text-sm font-sans font-semibold"
            style={{ color: "var(--color-accent)" }}
          >
            {showManager ? "Done" : "Manage"}
          </button>
        </div>

        {/* Always show current provider list */}
        <ul className="space-y-1 mb-4">
          {providers.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between text-sm py-1"
            >
              <span>
                <span
                  className="font-semibold"
                  style={{ color: "var(--color-ink)" }}
                >
                  {p.name}
                </span>
                <span
                  className="ml-2 font-mono text-xs"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  {p.id} · {p.api_type}
                </span>
              </span>
              {showManager && (
                <button
                  type="button"
                  onClick={() => handleRemoveProvider(p.id)}
                  className="text-xs font-sans"
                  style={{ color: "var(--color-error)" }}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>

        {showManager && (
          <>
            <div className="border-t pt-4 mb-4" style={{ borderColor: "var(--color-rule)" }}>
              <h3
                className="font-sans text-sm font-semibold mb-3"
                style={{ color: "var(--color-ink)" }}
              >
                Add provider
              </h3>
              <div className="grid gap-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label
                      className="block text-xs font-sans font-semibold uppercase tracking-wide mb-1"
                      style={{ color: "var(--color-ink-muted)" }}
                    >
                      ID (slug)
                    </label>
                    <input
                      type="text"
                      value={newProvider.id}
                      onChange={(e) =>
                        setNewProvider({ ...newProvider, id: e.target.value })
                      }
                      placeholder="e.g. deepseek"
                      className="w-full rounded-md border px-3 py-2 font-mono text-sm"
                      style={{
                        borderColor: "var(--color-rule)",
                        background: "var(--color-page)",
                      }}
                    />
                  </div>
                  <div className="flex-[2]">
                    <label
                      className="block text-xs font-sans font-semibold uppercase tracking-wide mb-1"
                      style={{ color: "var(--color-ink-muted)" }}
                    >
                      Display name
                    </label>
                    <input
                      type="text"
                      value={newProvider.name}
                      onChange={(e) =>
                        setNewProvider({ ...newProvider, name: e.target.value })
                      }
                      placeholder="e.g. DeepSeek"
                      className="w-full rounded-md border px-3 py-2 font-mono text-sm"
                      style={{
                        borderColor: "var(--color-rule)",
                        background: "var(--color-page)",
                      }}
                    />
                  </div>
                </div>
                <Field label="API type">
                  <select
                    value={newProvider.api_type}
                    onChange={(e) =>
                      setNewProvider({
                        ...newProvider,
                        api_type: e.target.value as
                          | "openai-compatible"
                          | "anthropic",
                      })
                    }
                    className="w-full rounded-md border px-3 py-2 font-sans text-sm"
                    style={{
                      borderColor: "var(--color-rule)",
                      background: "var(--color-page)",
                      minHeight: 40,
                    }}
                  >
                    {API_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <button
                type="button"
                onClick={handleAddProvider}
                className="mt-3 px-4 py-2 font-sans font-semibold rounded-md text-sm"
                style={{
                  minHeight: 36,
                  background: "var(--color-accent-soft)",
                  color: "var(--color-accent)",
                }}
              >
                Add
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveProviders}
                disabled={providerSaving}
                className="px-5 py-2 font-sans font-semibold rounded-md"
                style={{
                  minHeight: 40,
                  background: "var(--color-accent)",
                  color: "var(--color-paper)",
                  opacity: providerSaving ? 0.7 : 1,
                  cursor: providerSaving ? "not-allowed" : "pointer",
                }}
              >
                {providerSaving ? "Saving…" : "Save providers"}
              </button>
              {providerSaved && (
                <span
                  className="text-sm"
                  style={{ color: "var(--color-accent)" }}
                >
                  Saved.
                </span>
              )}
              {providerError && (
                <span
                  className="text-sm"
                  style={{ color: "var(--color-error)" }}
                  role="alert"
                >
                  {providerError}
                </span>
              )}
            </div>
          </>
        )}
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
