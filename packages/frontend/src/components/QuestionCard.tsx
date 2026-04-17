import type { OptionLetter } from "@story-sleuth/shared";
import type { ActiveQuestion } from "../api/sessions.js";

interface QuestionCardProps {
  question: ActiveQuestion;
  index: number;
  selected: OptionLetter | null;
  submitted: boolean;
  onSelect: (letter: OptionLetter) => void;
  onSubmit: () => void;
  submitting: boolean;
}

/**
 * One active-session question card. Options render as radio-like
 * pills; the submit button stays disabled until an option is chosen.
 * Once submitted, the card switches to a read-only state — the
 * student can't change their answer, and per the design doc they
 * don't get to see whether it was right until /end.
 */
export function QuestionCard({
  question,
  index,
  selected,
  submitted,
  onSelect,
  onSubmit,
  submitting,
}: QuestionCardProps): React.ReactElement {
  const humanType = question.question_type
    .replaceAll("-", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <article
      className="rounded-md border p-6 mb-6"
      style={{
        background: "var(--color-page)",
        borderColor: "var(--color-rule)",
      }}
      aria-label={`Question ${index + 1}`}
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
      <fieldset className="space-y-2" disabled={submitted}>
        <legend className="sr-only">Answer options</legend>
        {question.options.map((option) => {
          const isSelected = selected === option.letter;
          return (
            <label
              key={option.letter}
              className="flex items-start gap-4 p-4 rounded-md border cursor-pointer transition-[background,border-color] duration-100"
              style={{
                minHeight: 48,
                background: isSelected
                  ? "var(--color-accent-soft)"
                  : "var(--color-paper)",
                borderColor: isSelected
                  ? "var(--color-accent)"
                  : "var(--color-rule)",
                borderWidth: 1.5,
                opacity: submitted && !isSelected ? 0.6 : 1,
              }}
            >
              <input
                type="radio"
                name={`q-${question.id}`}
                value={option.letter}
                checked={isSelected}
                onChange={() => onSelect(option.letter)}
                className="mt-1"
                aria-label={`Option ${option.letter}`}
              />
              <span className="font-serif text-[16px]">
                <span className="font-semibold mr-1">{option.letter}.</span>
                {option.text}
              </span>
            </label>
          );
        })}
      </fieldset>
      <div className="flex justify-end mt-4">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!selected || submitted || submitting}
          className="px-6 font-sans font-semibold rounded-md transition-colors duration-100"
          style={{
            minHeight: 48,
            background:
              !selected || submitted
                ? "var(--color-rule)"
                : "var(--color-accent)",
            color:
              !selected || submitted
                ? "var(--color-ink-muted)"
                : "var(--color-paper)",
            cursor:
              !selected || submitted || submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitted ? "Answer saved" : submitting ? "Saving..." : "Submit answer"}
        </button>
      </div>
    </article>
  );
}
