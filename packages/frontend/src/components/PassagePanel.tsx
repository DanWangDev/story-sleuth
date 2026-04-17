import type { Passage } from "@story-sleuth/shared";

/**
 * The passage-reading column. Primary element of the session page —
 * bigger type, warmer surface, subtle paper-grain texture. Left-
 * aligned reading column, ~65ch line length cap per DESIGN.md.
 */
export function PassagePanel({
  passage,
}: {
  passage: Passage;
}): React.ReactElement {
  return (
    <section
      className="relative p-8"
      style={{
        background: "var(--color-paper)",
        borderRight: "1px solid var(--color-rule)",
      }}
      aria-label={`${passage.title} by ${passage.author}`}
    >
      <h2
        className="font-serif text-2xl font-semibold mb-1"
        style={{ color: "var(--color-ink)" }}
      >
        {passage.title}
      </h2>
      <p
        className="text-sm mb-6"
        style={{ color: "var(--color-ink-muted)" }}
      >
        {passage.author}
      </p>
      <div
        className="font-serif"
        style={{
          fontSize: "19px",
          lineHeight: 1.65,
          maxWidth: "65ch",
          color: "var(--color-ink)",
        }}
      >
        {passage.body.split(/\n\s*\n/).map((paragraph, i) => (
          <p key={i} className="mb-4 last:mb-0">
            {paragraph.trim()}
          </p>
        ))}
      </div>
    </section>
  );
}
