import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { OptionLetter } from "@story-sleuth/shared";
import { TopBar } from "../components/TopBar.js";
import { PassagePanel } from "../components/PassagePanel.js";
import { QuestionCard } from "../components/QuestionCard.js";
import {
  endSession,
  loadSession,
  submitAnswer,
  type ActiveQuestion,
  type SessionPayload,
} from "../api/sessions.js";
import { ApiError } from "../api/client.js";

type AnswerState = Record<
  string,
  { letter: OptionLetter; submitted: boolean }
>;

/**
 * Active session page. Two-column layout: passage on the left, all
 * questions visible on the right (design-review decision — matches
 * paper-exam "skip and return" technique). Answers are submitted one
 * at a time; per the feedback-timing rule students don't see
 * is_correct here — they see everything in the results page after
 * clicking Finish.
 */
export function SessionPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<SessionPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [submittingQid, setSubmittingQid] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const startTimesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await loadSession(id);
        if (cancelled) return;
        setPayload(p);
        if (!p.active) {
          // Session already ended — bounce to results.
          navigate(`/sessions/${id}/results`, { replace: true });
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError
            ? `Couldn't load the session: ${err.message}`
            : "Couldn't load the session.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  const activeQuestions: ActiveQuestion[] = useMemo(() => {
    if (!payload || !payload.active) return [];
    return payload.questions as ActiveQuestion[];
  }, [payload]);

  useEffect(() => {
    // Record the "first seen" timestamp for each visible question so we
    // can report a vaguely honest time_taken_ms when the student submits.
    for (const q of activeQuestions) {
      if (!(q.id in startTimesRef.current)) {
        startTimesRef.current[q.id] = Date.now();
      }
    }
  }, [activeQuestions]);

  const handleSelect = useCallback((qid: string, letter: OptionLetter) => {
    setAnswers((prev) => ({
      ...prev,
      [qid]: { letter, submitted: prev[qid]?.submitted ?? false },
    }));
  }, []);

  const handleSubmit = useCallback(
    async (qid: string) => {
      const a = answers[qid];
      if (!a || a.submitted || !id) return;
      setSubmittingQid(qid);
      const started = startTimesRef.current[qid] ?? Date.now();
      try {
        await submitAnswer(id, {
          question_id: qid,
          selected_letter: a.letter,
          time_taken_ms: Math.max(0, Date.now() - started),
        });
        setAnswers((prev) => ({
          ...prev,
          [qid]: { letter: a.letter, submitted: true },
        }));
      } catch (err) {
        // Duplicate answer (409) shouldn't happen because the UI locks
        // after submit, but the race is a real thing; just mark as
        // submitted if the server says so.
        if (err instanceof ApiError && err.status === 409) {
          setAnswers((prev) => ({
            ...prev,
            [qid]: { letter: a.letter, submitted: true },
          }));
        } else if (err instanceof ApiError) {
          setFinishError(`Couldn't save answer: ${err.message}`);
        } else {
          setFinishError("Couldn't save your answer. Check your connection.");
        }
      } finally {
        setSubmittingQid(null);
      }
    },
    [answers, id],
  );

  const handleFinish = useCallback(async () => {
    if (!id) return;
    setFinishing(true);
    setFinishError(null);
    try {
      await endSession(id);
      navigate(`/sessions/${id}/results`);
    } catch (err) {
      setFinishError(
        err instanceof ApiError
          ? `Couldn't finish the session: ${err.message}`
          : "Couldn't finish the session.",
      );
      setFinishing(false);
    }
  }, [id, navigate]);

  if (loadError) {
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
            {loadError}
          </p>
        </div>
      </div>
    );
  }

  if (!payload || !payload.active) {
    return (
      <div
        className="min-h-screen"
        style={{ background: "var(--color-page)" }}
      >
        <TopBar />
      </div>
    );
  }

  const answered = Object.values(answers).filter((a) => a.submitted).length;
  const total = activeQuestions.length;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--color-page)" }}
    >
      <TopBar
        right={
          <span
            className="font-sans text-sm"
            style={{ color: "var(--color-ink-muted)" }}
            aria-live="polite"
          >
            {answered} of {total} answered
          </span>
        }
      />
      <main
        className="flex-1 grid max-w-[1280px] mx-auto w-full"
        style={{ gridTemplateColumns: "60fr 40fr", minHeight: "600px" }}
      >
        <PassagePanel passage={payload.passage} />
        <section
          className="p-8 overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 72px)" }}
        >
          {activeQuestions.map((q, i) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={i}
              selected={answers[q.id]?.letter ?? null}
              submitted={answers[q.id]?.submitted ?? false}
              submitting={submittingQid === q.id}
              onSelect={(letter) => handleSelect(q.id, letter)}
              onSubmit={() => void handleSubmit(q.id)}
            />
          ))}
          <div
            className="sticky bottom-0 pt-4 pb-4"
            style={{
              background: "linear-gradient(to top, var(--color-page) 80%, transparent)",
            }}
          >
            <button
              type="button"
              onClick={() => void handleFinish()}
              disabled={finishing}
              className="w-full font-sans font-semibold rounded-md"
              style={{
                minHeight: 56,
                fontSize: "17px",
                background: "var(--color-accent)",
                color: "var(--color-paper)",
                opacity: finishing ? 0.7 : 1,
                cursor: finishing ? "not-allowed" : "pointer",
              }}
            >
              {finishing
                ? "Finishing..."
                : answered === total
                  ? "Finish and see results"
                  : `Finish now (${total - answered} unanswered)`}
            </button>
            {finishError && (
              <p
                className="mt-2 text-sm text-center"
                style={{ color: "var(--color-error)" }}
                role="alert"
              >
                {finishError}
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
