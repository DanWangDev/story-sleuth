import { useEffect, useMemo, useState } from "react";
import type { IngestJob } from "@story-sleuth/shared";
import {
  getJob,
  listManifests,
  listRecentJobs,
  triggerIngest,
} from "../api/admin.js";
import { ApiError } from "../api/client.js";

type Filter = "all" | "completed" | "failed";

/**
 * Ingest trigger + job monitor. Manifests on top, recent runs below.
 * Jobs are grouped by passage — one row per manifest showing the latest
 * status. Click to expand full history. Filter tabs to focus on
 * failures or successes.
 */
export function IngestPage(): React.ReactElement {
  const [manifests, setManifests] = useState<
    { id: number; title: string; author: string; exam_boards: string[]; difficulty: number; word_count_target: number }[] | null
  >(null);
  const [jobs, setJobs] = useState<IngestJob[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState<number | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [m, j] = await Promise.all([listManifests(), listRecentJobs()]);
        if (!cancelled) {
          setManifests(m);
          setJobs(j);
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError ? err.message : "Couldn't load ingest data.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll in-flight jobs.
  useEffect(() => {
    if (!jobs) return;
    const pending = jobs.filter(
      (j) => j.status === "pending" || j.status === "running",
    );
    if (pending.length === 0) return;
    const t = setInterval(async () => {
      try {
        const updated = await Promise.all(
          pending.map((p) => getJob(p.id).catch(() => p)),
        );
        setJobs((prev) => {
          if (!prev) return prev;
          const byId = new Map(updated.map((j) => [j.id, j]));
          return prev.map((j) => byId.get(j.id) ?? j);
        });
      } catch {
        /* polling best-effort */
      }
    }, 2000);
    return () => clearInterval(t);
  }, [jobs]);

  async function handleTrigger(manifestId: number): Promise<void> {
    setTriggering(manifestId);
    setTriggerError(null);
    try {
      const result = await triggerIngest(manifestId);
      setJobs((prev) => (prev ? [result.job, ...prev] : [result.job]));
    } catch (err) {
      setTriggerError(
        err instanceof ApiError
          ? `Couldn't trigger ingest: ${err.message}`
          : "Couldn't trigger ingest.",
      );
    } finally {
      setTriggering(null);
    }
  }

  // Group jobs by manifest, keep the latest per manifest.
  const latestByManifest = useMemo(() => {
    if (!jobs) return new Map<number, IngestJob>();
    const map = new Map<number, IngestJob>();
    for (const j of jobs) {
      const existing = map.get(j.passage_manifest_id);
      if (!existing || new Date(j.started_at) > new Date(existing.started_at)) {
        map.set(j.passage_manifest_id, j);
      }
    }
    return map;
  }, [jobs]);

  // All jobs for a given manifest, newest first.
  const historyFor = (manifestId: number): IngestJob[] =>
    (jobs ?? [])
      .filter((j) => j.passage_manifest_id === manifestId)
      .sort(
        (a, b) =>
          new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
      );

  // Filter the latest-per-manifest rows.
  const filteredLatest = useMemo(() => {
    const entries = [...latestByManifest.values()];
    if (filter === "all") return entries;
    return entries.filter((j) => j.status === filter);
  }, [latestByManifest, filter]);

  function toggleExpand(manifestId: number): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      const key = String(manifestId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loadError) {
    return (
      <p style={{ color: "var(--color-error)" }} role="alert">
        {loadError}
      </p>
    );
  }
  if (!manifests || !jobs) {
    return <p style={{ color: "var(--color-ink-muted)" }}>Loading…</p>;
  }

  return (
    <div className="grid gap-10">
      {/* ── Manifests ──────────────────────────────────────── */}
      <section>
        <h1
          className="font-serif text-3xl font-bold mb-2"
          style={{ color: "var(--color-ink)" }}
        >
          Ingest content
        </h1>
        <p
          className="font-serif mb-6 max-w-[60ch]"
          style={{ color: "var(--color-ink-muted)" }}
        >
          Pick a manifest to fetch the passage from its source URL and
          generate a fresh set of questions. Everything lands in the review
          queue as <em>pending_review</em> — nothing reaches students until
          you approve it.
        </p>
        {triggerError && (
          <p
            className="mb-4 text-sm"
            style={{ color: "var(--color-error)" }}
            role="alert"
          >
            {triggerError}
          </p>
        )}
        <div className="grid gap-3">
          {manifests.map((m) => (
            <div
              key={m.id}
              className="rounded-md border p-4 flex items-center justify-between gap-4"
              style={{
                background: "var(--color-paper)",
                borderColor: "var(--color-rule)",
              }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="font-serif text-lg font-semibold"
                    style={{ color: "var(--color-ink)" }}
                  >
                    #{m.id} {m.title}
                  </span>
                  {latestByManifest.has(m.id) && (
                    <StatusPill
                      status={latestByManifest.get(m.id)!.status}
                    />
                  )}
                </div>
                <div
                  className="text-sm font-sans"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  {m.author} · {m.exam_boards.join(", ")} · difficulty{" "}
                  {m.difficulty} · ~{m.word_count_target} words
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleTrigger(m.id)}
                disabled={triggering === m.id}
                className="px-4 py-2 font-sans font-semibold rounded-md shrink-0"
                style={{
                  minHeight: 40,
                  background: "var(--color-accent)",
                  color: "var(--color-paper)",
                  opacity: triggering === m.id ? 0.7 : 1,
                  cursor: triggering === m.id ? "not-allowed" : "pointer",
                }}
              >
                {triggering === m.id ? "Running…" : "Run ingest"}
              </button>
            </div>
          ))}
          {manifests.length === 0 && (
            <p
              className="text-sm"
              style={{ color: "var(--color-ink-muted)" }}
            >
              No manifests found.
            </p>
          )}
        </div>
      </section>

      {/* ── Jobs ────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2
            className="font-serif text-2xl font-semibold"
            style={{ color: "var(--color-ink)" }}
          >
            Recent runs
          </h2>
          <div className="flex gap-2">
            {(["all", "completed", "failed"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className="px-3 py-1 rounded text-xs font-sans font-semibold capitalize"
                style={{
                  background:
                    filter === f
                      ? "var(--color-accent)"
                      : "var(--color-accent-soft)",
                  color:
                    filter === f
                      ? "var(--color-paper)"
                      : "var(--color-accent)",
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        {filteredLatest.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            No {filter === "all" ? "" : filter} runs yet.
          </p>
        ) : (
          <div
            className="rounded-md border overflow-hidden"
            style={{
              background: "var(--color-paper)",
              borderColor: "var(--color-rule)",
            }}
          >
            <table className="w-full text-sm font-sans">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-rule)" }}>
                  <Th>Manifest</Th>
                  <Th>Status</Th>
                  <Th>Q gen / failed</Th>
                  <Th>Started</Th>
                  <Th>Notes</Th>
                </tr>
              </thead>
              <tbody>
                {filteredLatest.map((j) => {
                  const manifest = manifests.find(
                    (m) => m.id === j.passage_manifest_id,
                  );
                  const isOpen = expanded.has(String(j.passage_manifest_id));
                  const history = historyFor(j.passage_manifest_id);
                  return (
                    <JobRow
                      key={j.id}
                      job={j}
                      manifestTitle={manifest?.title}
                      isExpanded={isOpen}
                      history={history}
                      onToggle={() => toggleExpand(j.passage_manifest_id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function JobRow({
  job,
  manifestTitle,
  isExpanded,
  history,
  onToggle,
}: {
  job: IngestJob;
  manifestTitle?: string;
  isExpanded: boolean;
  history: IngestJob[];
  onToggle: () => void;
}): React.ReactElement {
  const hasHistory = history.length > 1;
  return (
    <>
      <tr
        onClick={hasHistory ? onToggle : undefined}
        style={{
          borderBottom: "1px solid var(--color-rule)",
          cursor: hasHistory ? "pointer" : "default",
        }}
      >
        <Td>
          <div className="flex items-center gap-1">
            {hasHistory && (
              <span
                className="text-xs font-mono"
                style={{ color: "var(--color-ink-quiet)" }}
              >
                {isExpanded ? "▼" : "▶"}
              </span>
            )}
            <span>#{job.passage_manifest_id}</span>
            {manifestTitle && (
              <span style={{ color: "var(--color-ink-muted)" }}>
                {manifestTitle}
              </span>
            )}
            {hasHistory && (
              <span
                className="text-xs font-mono"
                style={{ color: "var(--color-ink-quiet)" }}
              >
                ({history.length})
              </span>
            )}
          </div>
        </Td>
        <Td>
          <StatusPill status={job.status} />
        </Td>
        <Td>
          {job.questions_generated} / {job.questions_failed}
        </Td>
        <Td>{new Date(job.started_at).toLocaleString()}</Td>
        <Td>
          {job.error_log ? (
            <ErrorNotes log={job.error_log} />
          ) : (
            <span style={{ color: "var(--color-ink-muted)" }}>—</span>
          )}
        </Td>
      </tr>
      {isExpanded &&
        history.slice(1).map((h) => (
          <tr
            key={h.id}
            style={{
              borderBottom: "1px solid var(--color-rule)",
              opacity: 0.65,
            }}
          >
            <Td>
              <span style={{ color: "var(--color-ink-muted)" }}>
                #{h.passage_manifest_id}
              </span>
            </Td>
            <Td>
              <StatusPill status={h.status} />
            </Td>
            <Td>
              {h.questions_generated} / {h.questions_failed}
            </Td>
            <Td>{new Date(h.started_at).toLocaleString()}</Td>
            <Td>
              {h.error_log ? (
                <ErrorNotes log={h.error_log} />
              ) : (
                <span style={{ color: "var(--color-ink-muted)" }}>—</span>
              )}
            </Td>
          </tr>
        ))}
    </>
  );
}

function ErrorNotes({ log }: { log: string }): React.ReactElement {
  return (
    <div title={log}>
      <span
        className="inline-block px-1.5 py-0.5 rounded text-xs font-mono font-semibold mb-1"
        style={{
          background: "#F5E3DA",
          color: "var(--color-error)",
        }}
      >
        {extractErrorCode(log)}
      </span>
      <div
        className="text-xs font-mono leading-relaxed"
        style={{
          color: "var(--color-ink-muted)",
          maxWidth: "420px",
          wordBreak: "break-word",
        }}
      >
        {log}
      </div>
    </div>
  );
}

function StatusPill({
  status,
}: {
  status: IngestJob["status"];
}): React.ReactElement {
  const colors: Record<IngestJob["status"], { bg: string; fg: string }> = {
    pending: { bg: "#EFEAE0", fg: "#6B5B3F" },
    running: { bg: "#E8F1EE", fg: "var(--color-accent)" },
    completed: { bg: "#E1EEDF", fg: "#2F6B3C" },
    failed: { bg: "#F5E3DA", fg: "var(--color-error)" },
  };
  const c = colors[status];
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize"
      style={{ background: c.bg, color: c.fg }}
    >
      {status}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <th
      className="text-left font-semibold px-4 py-3"
      style={{ color: "var(--color-ink-muted)" }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <td className="px-4 py-3 align-top" style={{ color: "var(--color-ink)" }}>
      {children}
    </td>
  );
}

function extractErrorCode(log: string): string {
  const m = log.match(/\[(\w+)\]/);
  if (m) return m[1];
  const parts = log.split(":");
  return parts.length >= 2 ? parts[0].trim() : "error";
}
