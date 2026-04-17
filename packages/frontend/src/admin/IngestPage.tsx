import { useEffect, useState } from "react";
import type { IngestJob, PassageManifest } from "@story-sleuth/shared";
import {
  getJob,
  listManifests,
  listRecentJobs,
  triggerIngest,
} from "../api/admin.js";
import { ApiError } from "../api/client.js";

/**
 * Ingest trigger + job monitor. Top half: list manifests, click Run to
 * fire the pipeline. Bottom half: recent jobs table, auto-polling any
 * job that's still pending or running every 2s.
 *
 * Phase 1 backend runs the pipeline inline so a "running" job usually
 * resolves in the same response. The polling is defensive for when we
 * swap in BullMQ.
 */
export function IngestPage(): React.ReactElement {
  const [manifests, setManifests] = useState<PassageManifest[] | null>(null);
  const [jobs, setJobs] = useState<IngestJob[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState<number | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);

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

  // Poll any in-flight jobs.
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
        /* polling best-effort; ignore transient errors */
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
              <div>
                <div
                  className="font-serif text-lg font-semibold"
                  style={{ color: "var(--color-ink)" }}
                >
                  {m.title}
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
                className="px-4 py-2 font-sans font-semibold rounded-md"
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
              No manifests found. Check that the container was built with the
              content/ directory.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2
          className="font-serif text-2xl font-semibold mb-4"
          style={{ color: "var(--color-ink)" }}
        >
          Recent runs
        </h2>
        <JobsTable jobs={jobs} />
      </section>
    </div>
  );
}

function JobsTable({ jobs }: { jobs: IngestJob[] }): React.ReactElement {
  if (jobs.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
        No ingest runs yet.
      </p>
    );
  }
  return (
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
          {jobs.map((j) => (
            <tr
              key={j.id}
              style={{ borderBottom: "1px solid var(--color-rule)" }}
            >
              <Td>#{j.passage_manifest_id}</Td>
              <Td>
                <StatusPill status={j.status} />
              </Td>
              <Td>
                {j.questions_generated} / {j.questions_failed}
              </Td>
              <Td>{new Date(j.started_at).toLocaleString()}</Td>
              <Td>
                {j.error_log ? (
                  <span
                    title={j.error_log}
                    style={{ color: "var(--color-ink-muted)" }}
                  >
                    {truncate(j.error_log, 80)}
                  </span>
                ) : (
                  <span style={{ color: "var(--color-ink-muted)" }}>—</span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
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

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
