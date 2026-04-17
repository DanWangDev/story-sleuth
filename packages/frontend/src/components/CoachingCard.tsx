import type { Question, StudentAttempt } from "@story-sleuth/shared";

interface CoachingCardProps {
  question: Question;
  attempt: StudentAttempt | undefined;
  index: number;
}

/**
 * Post-session review card. Shows the student what they picked,
 * what was correct, and the pre-generated per-option explanations
 * so they can learn from wrong answers. Uses warm amber (NOT red)
 * for the "let's look at this together" state — design decision
 * #3 in DESIGN.md's risk list.
 */
export function CoachingCard({
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
      </div>
    </article>
  );
}
