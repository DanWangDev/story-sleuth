import { useState } from "react";
import type { Question, StudentAttempt } from "@story-sleuth/shared";
import { requestWalkthrough } from "../api/sessions.js";
import { ApiError } from "../api/client.js";

interface CoachingCardProps {
  sessionId: string;
  question: Question;
  attempt: StudentAttempt | undefined;
  index: number;
}

/**
 * Post-session review card. Shows the student what they picked, what
 * was correct, and the pre-generated per-option explanations so they
 * can learn from wrong answers. Uses warm amber (NOT red) for the
 * "let's look at this together" state — design decision #3 in
 * DESIGN.md's risk list.
 *
 * For wrong answers, the card offers a "Show me a walk-through"
 * button that hits /api/coach to get a live LLM explanation. Button
 * debounces (disabled while loading); 429 surfaces a friendly "try
 * again in a moment" message.
 */
export function CoachingCard({
  sessionId,
  question,
  attempt,
  index,
}: CoachingCardProps): React.ReactElement {
  const humanType = question.question_type
    .replaceAll("-", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const status: "correct" | "wrong" | "unanswered" = attempt
    ? attempt.is_correct
      ? "correct"
      : "wrong"
    : "unanswered";

  const accentColor =
    status === "correct"
      ? "var(--color-success)"
      : status === "wrong"
        ? "var(--color-warning)"
        : "var(--color-ink-quiet)";

  const label =
    status === "correct"
      ? "You got this one"
      : status === "wrong"
        ? "Let's look at this together"
        : "You didn't answer this one";

  const [walkthroughText, setWalkthroughText] = useState<string | null>(null);
  const [walkthroughError, setWalkthroughError] = useState<string | null>(null);
  const [walkthroughLoading, setWalkthroughLoading] = useState(false);

  async function handleWalkthrough(): Promise<void> {
    if (!attempt || walkthroughLoading) return;
    setWalkthroughLoading(true);
    setWalkthroughError(null);
    try {
      const r = await requestWalkthrough(sessionId, attempt.id);
      setWalkthroughText(r.text);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setWalkthroughError(
          "Give us a moment — let's try that again in a little bit.",
        );
      } else if (err instanceof ApiError && err.status === 503) {
        setWalkthroughError(
          "The coach isn't set up yet. Ask an admin to configure the LLM provider.",
        );
      } else if (err instanceof ApiError) {
        setWalkthroughError("Couldn't reach the coach. Try again in a moment.");
      } else {
        setWalkthroughError("Something went wrong. Try again in a moment.");
      }
    } finally {
      setWalkthroughLoading(false);
    }
  }

  return (
    <article
      className="rounded-md border p-6 mb-6"
      style={{
        background: "var(--color-page)",
        borderColor: "var(--color-rule)",
      }}
      aria-label={`Question ${index + 1} review`}
    >
      <div className="flex justify-between text-[13px] mb-3">
        <span
          className="font-semibold"
          style={{ color: "var(--color-accent)" }}
        >
          Question {index + 1}
        </span>
        <span
          className="uppercase tracking-wider text-[11px] font-medium"
          style={{ color: "var(--color-ink-muted)" }}
        >
          {humanType}
        </span>
      </div>

      <p
        className="font-serif text-[17px] leading-snug mb-4"
        style={{ color: "var(--color-ink)" }}
      >
        {question.text}
      </p>

      <ul className="space-y-2 mb-4">
        {question.options.map((option) => {
          const isCorrect = option.letter === question.correct_option;
          const isChosen = attempt?.selected_letter === option.letter;
          const showCorrect = isCorrect;
          const showWrong = isChosen && !isCorrect;

          return (
            <li
              key={option.letter}
              className="p-4 rounded-md border"
              style={{
                minHeight: 48,
                borderWidth: 1.5,
                borderColor: showCorrect
                  ? "var(--color-success)"
                  : showWrong
                    ? "var(--color-warning)"
                    : "var(--color-rule)",
                background: showCorrect
                  ? "#EEF4E3"
                  : showWrong
                    ? "var(--color-warning-soft)"
                    : "var(--color-paper)",
              }}
            >
              <div className="font-serif text-[16px] mb-1">
                <span className="font-semibold mr-1">{option.letter}.</span>
                {option.text}
                {showCorrect && (
                  <span
                    className="ml-3 text-[12px] uppercase tracking-wider font-semibold"
                    style={{ color: "var(--color-success)" }}
                  >
                    ✓ Correct
                  </span>
                )}
                {showWrong && (
                  <span
                    className="ml-3 text-[12px] uppercase tracking-wider font-semibold"
                    style={{ color: "var(--color-warning)" }}
                  >
                    ✗ Your choice
                  </span>
                )}
              </div>
              <p
                className="text-[14px] leading-relaxed"
                style={{ color: "var(--color-ink-muted)" }}
              >
                {option.explanation_if_chosen}
              </p>
            </li>
          );
        })}
      </ul>

      <div
        className="pl-4 py-2 border-l-[3px]"
        style={{ borderColor: accentColor }}
      >
        <div
          className="text-[12px] uppercase tracking-wider font-semibold mb-1"
          style={{ color: accentColor }}
        >
          {label}
        </div>

        {status === "wrong" && walkthroughText === null && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => void handleWalkthrough()}
              disabled={walkthroughLoading}
              className="font-sans font-semibold rounded-md text-[14px] px-4 py-2"
              style={{
                minHeight: 40,
                background: "transparent",
                color: "var(--color-accent)",
                border: "1.5px solid var(--color-accent)",
                cursor: walkthroughLoading ? "wait" : "pointer",
                opacity: walkthroughLoading ? 0.7 : 1,
              }}
            >
              {walkthroughLoading ? "Thinking..." : "Show me a walk-through →"}
            </button>
          </div>
        )}
        {walkthroughError && (
          <p
            className="mt-2 text-[14px]"
            style={{ color: "var(--color-warning)" }}
            role="alert"
          >
            {walkthroughError}
          </p>
        )}
        {walkthroughText && (
          <div
            className="mt-3 font-serif text-[15px] leading-relaxed whitespace-pre-wrap"
            style={{ color: "var(--color-ink)" }}
          >
            {walkthroughText}
          </div>
        )}
      </div>
    </article>
  );
}
