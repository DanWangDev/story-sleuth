import { useEffect, useState } from "react";
import type { Passage, Question } from "@story-sleuth/shared";
import {
  listPendingPassages,
  listQuestionsByPassage,
  setPassageStatus,
  setQuestionStatus,
} from "../api/admin.js";
import { ApiError } from "../api/client.js";

/**
 * Review queue. Lists every passage currently in `pending_review`,
 * lets the admin expand one, read the body + its generated questions
 * (collapsed by default), and publish or archive each item
 * individually. Publishing a passage does NOT auto-publish its
 * questions — the admin must approve each question too so a bad
 * generation never leaks into a student session.
 */
export function ReviewPage(): React.ReactElement {
  const [passages, setPassages] = useState<Passage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await listPendingPassages();
        if (!cancelled) setPassages(r);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError ? err.message : "Couldn't load queue.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePassageAction(
    p: Passage,
    status: "published" | "archived",
  ): Promise<void> {
    await setPassageStatus(p.id, p.version, status);
    setPassages((prev) =>
      prev ? prev.filter((x) => !(x.id === p.id && x.version === p.version)) : prev,
    );
    if (expanded === keyOf(p)) setExpanded(null);
  }

  if (loadError) {
    return (
      <p style={{ color: "var(--color-error)" }} role="alert">
        {loadError}
      </p>
    );
  }
  if (!passages) {
    return <p style={{ color: "var(--color-ink-muted)" }}>Loading…</p>;
  }

  return (
    <div>
      <h1
        className="font-serif text-3xl font-bold mb-2"
        style={{ color: "var(--color-ink)" }}
      >
        Review queue
      </h1>
      <p
        className="font-serif mb-8 max-w-[60ch]"
        style={{ color: "var(--color-ink-muted)" }}
      >
        Every passage the ingest pipeline produces lands here. Read the
        body, skim the questions, publish the ones that look right,
        archive the ones that don't.
      </p>

      {passages.length === 0 ? (
        <p style={{ color: "var(--color-ink-muted)" }}>
          Queue is empty — run an ingest to populate it.
        </p>
      ) : (
        <div className="grid gap-4">
          {passages.map((p) => (
            <PassageCard
              key={keyOf(p)}
              passage={p}
              expanded={expanded === keyOf(p)}
              onToggle={() =>
                setExpanded((prev) => (prev === keyOf(p) ? null : keyOf(p)))
              }
              onPublish={() => handlePassageAction(p, "published")}
              onArchive={() => handlePassageAction(p, "archived")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function keyOf(p: Passage): string {
  return `${p.id}@${p.version}`;
}

function PassageCard({
  passage,
  expanded,
  onToggle,
  onPublish,
  onArchive,
}: {
  passage: Passage;
  expanded: boolean;
  onToggle: () => void;
  onPublish: () => Promise<void>;
  onArchive: () => Promise<void>;
}): React.ReactElement {
  const [acting, setActing] = useState<"publish" | "archive" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function wrap(
    kind: "publish" | "archive",
    fn: () => Promise<void>,
  ): Promise<void> {
    setActing(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setActing(null);
    }
  }

  return (
    <article
      className="rounded-md border"
      style={{
        background: "var(--color-paper)",
        borderColor: "var(--color-rule)",
      }}
    >
      <div className="p-5 flex items-start justify-between gap-4">
        <div>
          <h2
            className="font-serif text-xl font-semibold"
            style={{ color: "var(--color-ink)" }}
          >
            {passage.title}
          </h2>
          <p
            className="text-sm font-sans mt-1"
            style={{ color: "var(--color-ink-muted)" }}
          >
            {passage.author} · {passage.exam_boards.join(", ")} ·
            difficulty {passage.difficulty} · {passage.word_count} words
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="text-sm font-sans underline"
            style={{ color: "var(--color-ink-muted)" }}
            aria-expanded={expanded}
            aria-controls={`passage-${passage.id}-body`}
          >
            {expanded ? "Collapse" : "Review"}
          </button>
          <button
            type="button"
            onClick={() => void wrap("publish", onPublish)}
            disabled={acting !== null}
            className="px-4 py-2 font-sans font-semibold rounded-md text-sm"
            style={{
              minHeight: 36,
              background: "var(--color-accent)",
              color: "var(--color-paper)",
              opacity: acting !== null ? 0.7 : 1,
            }}
          >
            {acting === "publish" ? "Publishing…" : "Publish"}
          </button>
          <button
            type="button"
            onClick={() => void wrap("archive", onArchive)}
            disabled={acting !== null}
            className="px-4 py-2 font-sans font-semibold rounded-md text-sm border"
            style={{
              minHeight: 36,
              borderColor: "var(--color-rule)",
              color: "var(--color-ink)",
              background: "transparent",
              opacity: acting !== null ? 0.7 : 1,
            }}
          >
            Archive
          </button>
        </div>
      </div>
      {error && (
        <p
          className="px-5 pb-3 text-sm"
          style={{ color: "var(--color-error)" }}
          role="alert"
        >
          {error}
        </p>
      )}
      {expanded && (
        <div
          id={`passage-${passage.id}-body`}
          className="border-t px-5 py-4 grid gap-6"
          style={{ borderColor: "var(--color-rule)" }}
        >
          <div>
            <h3
              className="font-sans text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: "var(--color-ink-muted)" }}
            >
              Passage
            </h3>
            <div
              className="font-serif whitespace-pre-wrap leading-relaxed"
              style={{ color: "var(--color-ink)" }}
            >
              {passage.body}
            </div>
          </div>
          <QuestionsList
            passageId={passage.id}
            version={passage.version}
          />
        </div>
      )}
    </article>
  );
}

function QuestionsList({
  passageId,
  version,
}: {
  passageId: string;
  version: number;
}): React.ReactElement {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await listQuestionsByPassage(passageId, version);
        if (!cancelled) setQuestions(r);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Couldn't load questions.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [passageId, version]);

  async function handleStatus(
    q: Question,
    status: "published" | "archived",
  ): Promise<void> {
    const updated = await setQuestionStatus(q.id, status);
    setQuestions((prev) =>
      prev ? prev.map((x) => (x.id === q.id ? updated : x)) : prev,
    );
  }

  if (error) {
    return (
      <p className="text-sm" style={{ color: "var(--color-error)" }} role="alert">
        {error}
      </p>
    );
  }
  if (!questions) {
    return (
      <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
        Loading questions…
      </p>
    );
  }
  return (
    <div>
      <h3
        className="font-sans text-xs font-semibold uppercase tracking-wide mb-2"
        style={{ color: "var(--color-ink-muted)" }}
      >
        Questions ({questions.length})
      </h3>
      <div className="grid gap-4">
        {questions.map((q) => (
          <QuestionCard
            key={q.id}
            question={q}
            onPublish={() => handleStatus(q, "published")}
            onArchive={() => handleStatus(q, "archived")}
          />
        ))}
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  onPublish,
  onArchive,
}: {
  question: Question;
  onPublish: () => Promise<void>;
  onArchive: () => Promise<void>;
}): React.ReactElement {
  const [acting, setActing] = useState<"publish" | "archive" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function wrap(
    kind: "publish" | "archive",
    fn: () => Promise<void>,
  ): Promise<void> {
    setActing(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setActing(null);
    }
  }

  return (
    <div
      className="rounded-md border p-4"
      style={{
        background: "var(--color-page)",
        borderColor: "var(--color-rule)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div
            className="text-xs font-sans uppercase tracking-wide mb-1"
            style={{ color: "var(--color-ink-muted)" }}
          >
            {question.question_type} · {question.exam_boards.join(", ")} ·
            difficulty {question.difficulty} · {question.status}
          </div>
          <p
            className="font-serif mb-3"
            style={{ color: "var(--color-ink)" }}
          >
            {question.text}
          </p>
          <ul className="grid gap-1">
            {question.options.map((o) => {
              const isCorrect = o.letter === question.correct_option;
              return (
                <li
                  key={o.letter}
                  className="font-serif text-sm"
                  style={{
                    color: isCorrect
                      ? "var(--color-accent)"
                      : "var(--color-ink)",
                  }}
                >
                  <strong>{o.letter}.</strong> {o.text}
                  {isCorrect && " ← correct"}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void wrap("publish", onPublish)}
            disabled={acting !== null || question.status === "published"}
            className="px-3 py-1.5 font-sans font-semibold rounded-md text-xs"
            style={{
              background: "var(--color-accent)",
              color: "var(--color-paper)",
              opacity:
                acting !== null || question.status === "published" ? 0.5 : 1,
            }}
          >
            {acting === "publish" ? "…" : "Publish"}
          </button>
          <button
            type="button"
            onClick={() => void wrap("archive", onArchive)}
            disabled={acting !== null || question.status === "archived"}
            className="px-3 py-1.5 font-sans font-semibold rounded-md text-xs border"
            style={{
              borderColor: "var(--color-rule)",
              background: "transparent",
              color: "var(--color-ink)",
              opacity:
                acting !== null || question.status === "archived" ? 0.5 : 1,
            }}
          >
            Archive
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-xs" style={{ color: "var(--color-error)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
