import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@story-sleuth/shared";
import { TopBar } from "../components/TopBar.js";
import { useAuth } from "../auth/auth-context.js";
import {
  createSession,
  listInProgress,
  type SessionPayload,
} from "../api/sessions.js";
import { ApiError } from "../api/client.js";

/**
 * Landing page. Two states:
 *   - Anonymous: centred wordmark + tagline + Sign-in button.
 *   - Authenticated: primary "Start a new session" action, plus a
 *     resume card per in-progress session.
 */
export function LandingPage(): React.ReactElement {
  const { state, login } = useAuth();
  const navigate = useNavigate();
  const [inProgress, setInProgress] = useState<Session[] | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (state.status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        const r = await listInProgress();
        if (!cancelled) setInProgress(r.sessions);
      } catch {
        if (!cancelled) setInProgress([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.status]);

  async function handleStart(): Promise<void> {
    setStarting(true);
    setStartError(null);
    try {
      const payload: SessionPayload = await createSession({
        mode: "practice",
        exam_board: "GL",
      });
      navigate(`/sessions/${payload.session.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setStartError(
            "No content available yet. Ask your admin to publish some questions first.",
          );
        } else {
          setStartError(`Couldn't start a session: ${err.message}`);
        }
      } else {
        setStartError("Couldn't start a session. Please try again.");
      }
    } finally {
      setStarting(false);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="min-h-screen" style={{ background: "var(--color-page)" }}>
        <TopBar />
      </div>
    );
  }

  if (state.status === "anonymous") {
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{ background: "var(--color-page)" }}
      >
        <TopBar />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-[560px] text-center">
            <h1
              className="font-serif text-5xl font-bold tracking-tight mb-4"
              style={{ color: "var(--color-ink)" }}
            >
              Read a passage. Answer questions. Learn from every one.
            </h1>
            <p
              className="font-serif text-xl max-w-[50ch] mx-auto mb-8"
              style={{ color: "var(--color-ink-muted)" }}
            >
              When you get one wrong, we'll look at it together.
            </p>
            <button
              type="button"
              onClick={() => login()}
              className="px-8 py-3 font-sans font-semibold rounded-md"
              style={{
                minHeight: 48,
                background: "var(--color-accent)",
                color: "var(--color-paper)",
              }}
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--color-page)" }}
    >
      <TopBar />
      <main className="flex-1 max-w-[1280px] mx-auto w-full px-6 py-12">
        <h1
          className="font-serif text-4xl font-bold mb-2"
          style={{ color: "var(--color-ink)" }}
        >
          Welcome back
          {state.user.display_name ? `, ${state.user.display_name}` : ""}
        </h1>
        <p
          className="font-serif text-lg max-w-[65ch] mb-10"
          style={{ color: "var(--color-ink-muted)" }}
        >
          Pick up where you left off, or start a new reading.
        </p>

        {inProgress && inProgress.length > 0 && (
          <section className="mb-12">
            <h2
              className="font-serif text-2xl font-semibold mb-4"
              style={{ color: "var(--color-ink)" }}
            >
              In progress
            </h2>
            <div className="space-y-3 max-w-[560px]">
              {inProgress.map((s) => (
                <div
                  key={s.id}
                  className="rounded-md border p-5"
                  style={{
                    background: "var(--color-paper)",
                    borderColor: "var(--color-rule)",
                  }}
                >
                  <div
                    className="font-serif text-lg font-semibold mb-1"
                    style={{ color: "var(--color-ink)" }}
                  >
                    {s.mode === "practice" ? "Practice" : "Test"} session
                  </div>
                  <div
                    className="text-sm mb-3"
                    style={{ color: "var(--color-ink-muted)" }}
                  >
                    Started {new Date(s.started_at).toLocaleDateString()} ·
                    {" "}
                    {s.exam_board}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/sessions/${s.id}`)}
                    className="px-5 py-2 font-sans font-semibold rounded-md"
                    style={{
                      minHeight: 40,
                      background: "var(--color-accent)",
                      color: "var(--color-paper)",
                    }}
                  >
                    Continue
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <button
            type="button"
            onClick={handleStart}
            disabled={starting}
            className="px-8 font-sans font-semibold rounded-md"
            style={{
              minHeight: 56,
              background: "var(--color-accent)",
              color: "var(--color-paper)",
              fontSize: "18px",
              cursor: starting ? "not-allowed" : "pointer",
              opacity: starting ? 0.7 : 1,
            }}
          >
            {starting ? "Starting..." : "Start a new session"}
          </button>
          {startError && (
            <p
              className="mt-3 text-sm"
              style={{ color: "var(--color-error)" }}
              role="alert"
            >
              {startError}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
