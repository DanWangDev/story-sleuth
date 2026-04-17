import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { StudentAttempt } from "@story-sleuth/shared";
import { TopBar } from "../components/TopBar.js";
import { PassagePanel } from "../components/PassagePanel.js";
import { CoachingCard } from "../components/CoachingCard.js";
import {
  endSession,
  loadSession,
  type SessionResults,
} from "../api/sessions.js";
import { ApiError } from "../api/client.js";

/**
 * Post-session review page. Two-column like the session page so the
 * passage stays on the left for cross-reference. Right column shows
 * per-question review with pre-generated explanations, plus a
 * summary at the top. Wrong-answer cards use warm amber, never red.
 */
export function ResultsPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const [results, setResults] = useState<SessionResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        // Prefer /end (idempotent) so a mid-session reload lands here
        // cleanly even if the user never hit Finish. If already ended,
        // the server returns the same ended_at.
        const r = await endSession(id);
        if (!cancelled) setResults(r);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setError("This session belongs to another user.");
          return;
        }
        try {
          // Fall back to GET — covers weird edge cases.
          const p = await loadSession(id);
          if (!cancelled && !p.active) {
            setResults({
              session: p.session,
              passage: p.passage,
              questions: p.questions,
              attempts: [],
              summary: {
                total: 0,
                correct: 0,
                accuracy: 0,
                per_type_breakdown: [],
                unanswered_question_ids: p.session.question_ids,
              },
            });
          }
        } catch (err2) {
          setError(
            err2 instanceof ApiError
              ? `Couldn't load results: ${err2.message}`
              : "Couldn't load results.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{ background: "var(--color-page)" }}
      >
        <TopBar />
        <div className="flex-1 flex items-center justify-center">
          <p
            className="font-serif text-xl"
            style={{ color: "var(--color-error)" }}
          >
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div
        className="min-h-screen"
        style={{ background: "var(--color-page)" }}
      >
        <TopBar />
      </div>
    );
  }

  const attemptsByQid = new Map<string, StudentAttempt>(
    results.attempts.map((a) => [a.question_id, a]),
  );

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--color-page)" }}
    >
      <TopBar
        right={
          <Link
            to="/"
            className="text-sm no-underline"
            style={{ color: "var(--color-accent)" }}
          >
            ← Back to start
          </Link>
        }
      />
      <main
        className="flex-1 grid max-w-[1280px] mx-auto w-full"
        style={{ gridTemplateColumns: "60fr 40fr" }}
      >
        <PassagePanel passage={results.passage} />
        <section
          className="p-8 overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 72px)" }}
        >
          <header
            className="mb-8 pb-5"
            style={{ borderBottom: "1px solid var(--color-rule)" }}
          >
            <h1
              className="font-serif text-3xl font-semibold mb-2"
              style={{ color: "var(--color-ink)" }}
            >
              Results
            </h1>
            <p
              className="font-serif text-lg"
              style={{ color: "var(--color-ink)" }}
            >
              You answered{" "}
              <strong style={{ color: "var(--color-accent)" }}>
                {results.summary.correct} of {results.summary.total}
              </strong>{" "}
              correctly
              {results.summary.total > 0
                ? ` (${Math.round(results.summary.accuracy * 100)}%).`
                : "."}
              {results.summary.unanswered_question_ids.length > 0 && (
                <>
                  {" "}
                  {results.summary.unanswered_question_ids.length} unanswered.
                </>
              )}
            </p>
            {results.summary.per_type_breakdown.length > 0 && (
              <ul
                className="mt-3 text-[14px] space-y-1"
                style={{ color: "var(--color-ink-muted)" }}
              >
                {results.summary.per_type_breakdown.map((row) => (
                  <li key={row.question_type}>
                    <span className="capitalize">
                      {row.question_type.replaceAll("-", " ")}
                    </span>{" "}
                    — {row.correct}/{row.total} correct
                  </li>
                ))}
              </ul>
            )}
          </header>

          {results.questions.map((q, i) => (
            <CoachingCard
              key={q.id}
              sessionId={results.session.id}
              question={q}
              attempt={attemptsByQid.get(q.id)}
              index={i}
            />
          ))}

          <div
            className="sticky bottom-0 pt-4 pb-4"
            style={{
              background:
                "linear-gradient(to top, var(--color-page) 80%, transparent)",
            }}
          >
            <Link
              to="/"
              className="block w-full text-center font-sans font-semibold rounded-md no-underline"
              style={{
                minHeight: 56,
                lineHeight: "56px",
                fontSize: "17px",
                background: "var(--color-accent)",
                color: "var(--color-paper)",
              }}
            >
              Start another session
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
