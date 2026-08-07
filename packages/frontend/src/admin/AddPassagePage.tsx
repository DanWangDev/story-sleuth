import { useState } from "react";
import type { ExamBoard, QuestionType } from "@story-sleuth/shared";
import {
  searchBooks,
  listSections,
  extractSection,
  triggerIngest,
  type SearchResult,
  type Section,
  type ExtractedText,
} from "../api/admin.js";
import { ApiError } from "../api/client.js";

const EXAM_BOARDS: ExamBoard[] = ["CEM", "GL", "ISEB"];
const QUESTION_TYPES: QuestionType[] = [
  "retrieval",
  "inference",
  "vocabulary-in-context",
  "authors-intent",
  "figurative-language",
  "structure-and-organization",
];

type Step = "search" | "sections" | "preview";

export function AddPassagePage(): React.ReactElement {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("search");
  const [selectedBook, setSelectedBook] = useState<SearchResult | null>(null);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [loadingSections, setLoadingSections] = useState(false);

  const [extracted, setExtracted] = useState<ExtractedText | null>(null);
  const [extracting, setExtracting] = useState(false);

  const [examBoards, setExamBoards] = useState<ExamBoard[]>(["GL"]);
  const [difficulty, setDifficulty] = useState<number>(2);

  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  async function handleSearch(): Promise<void> {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      const r = await searchBooks(query.trim());
      setResults(r);
      if (r.length === 0) setSearchError("No results found.");
    } catch (err) {
      setSearchError(
        err instanceof ApiError ? err.message : "Search failed.",
      );
    } finally {
      setSearching(false);
    }
  }

  async function handleSelectBook(book: SearchResult): Promise<void> {
    setSelectedBook(book);
    setStep("sections");
    setLoadingSections(true);
    setSections(null);
    try {
      const s = await listSections(book.source, book.bookId);
      setSections(s);
    } catch {
      setSections([]);
    } finally {
      setLoadingSections(false);
    }
  }

  async function handleSelectSection(section: Section): Promise<void> {
    if (!selectedBook) return;
    setExtracting(true);
    setStep("preview");
    try {
      const text = await extractSection(
        selectedBook.source,
        selectedBook.bookId,
        section.sectionId,
      );
      setExtracted(text);
    } catch (err) {
      setIngestError(
        err instanceof ApiError ? err.message : "Failed to extract text.",
      );
      setStep("sections");
    } finally {
      setExtracting(false);
    }
  }

  async function handleGenerate(): Promise<void> {
    if (!extracted || !selectedBook) return;
    setIngesting(true);
    setIngestError(null);
    setIngestResult(null);
    try {
      const result = await triggerIngest(1, {
        body: extracted.body,
        word_count: extracted.wordCount,
        exam_board: examBoards[0],
        question_types: QUESTION_TYPES,
      });
      setIngestResult(
        `Job started. ${result.passage_id ? "Passage created." : ""}`,
      );
    } catch (err) {
      setIngestError(
        err instanceof ApiError ? err.message : "Ingest failed.",
      );
    } finally {
      setIngesting(false);
    }
  }

  function handleBack(): void {
    if (step === "preview") {
      setStep("sections");
      setExtracted(null);
    } else if (step === "sections") {
      setStep("search");
      setSections(null);
      setSelectedBook(null);
    }
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold mb-2" style={{ color: "var(--color-ink)" }}>
        Add passage
      </h1>
      <p className="font-serif mb-8 max-w-[60ch]" style={{ color: "var(--color-ink-muted)" }}>
        Search for a book, pick a chapter, review the text, and generate
        questions. Everything lands in the review queue as{" "}
        <em>pending_review</em>.
      </p>

      {/* Search bar */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search by title or author..."
          className="flex-1 rounded-md border px-4 py-3 font-sans text-base"
          style={{
            borderColor: "var(--color-rule)",
            background: "var(--color-page)",
            minHeight: 48,
          }}
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="px-6 py-3 font-sans font-semibold rounded-md"
          style={{
            minHeight: 48,
            background: "var(--color-accent)",
            color: "var(--color-paper)",
            opacity: searching ? 0.7 : 1,
          }}
        >
          {searching ? "Searching..." : "Search"}
        </button>
      </div>

      {searchError && (
        <p className="mb-4 text-sm" style={{ color: "var(--color-error)" }}>
          {searchError}
        </p>
      )}

      {/* Step indicator */}
      {step !== "search" && (
        <div className="flex items-center gap-2 mb-6 text-sm font-sans">
          <button
            type="button"
            onClick={handleBack}
            className="font-semibold"
            style={{ color: "var(--color-accent)" }}
          >
            {"←"} Back
          </button>
          <span style={{ color: "var(--color-ink-muted)" }}>
            {step === "sections" && selectedBook
              ? ` · ${selectedBook.title}`
              : ""}
            {step === "preview" && extracted
              ? ` · ${extracted.title}`
              : ""}
          </span>
        </div>
      )}

      {/* Search results */}
      {step === "search" && results && (
        <div className="grid gap-3">
          {results.map((r) => (
            <button
              key={`${r.source}-${r.bookId}`}
              type="button"
              onClick={() => handleSelectBook(r)}
              className="rounded-md border p-4 text-left w-full"
              style={{
                background: "var(--color-paper)",
                borderColor: "var(--color-rule)",
              }}
            >
              <div className="font-serif text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
                {r.title}
              </div>
              <div className="text-sm font-sans" style={{ color: "var(--color-ink-muted)" }}>
                {r.author} · {r.source}
                {r.yearPublished ? ` · ${r.yearPublished}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Sections list */}
      {step === "sections" && (
        <div>
          {loadingSections ? (
            <p style={{ color: "var(--color-ink-muted)" }}>Loading chapters...</p>
          ) : sections && sections.length > 0 ? (
            <div className="grid gap-3">
              {sections.map((s) => (
                <button
                  key={s.sectionId}
                  type="button"
                  onClick={() => handleSelectSection(s)}
                  className="rounded-md border p-4 text-left w-full"
                  style={{
                    background: "var(--color-paper)",
                    borderColor: "var(--color-rule)",
                  }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-serif text-base font-semibold" style={{ color: "var(--color-ink)" }}>
                      {s.title}
                    </div>
                    <span className="text-xs font-mono shrink-0" style={{ color: "var(--color-ink-muted)" }}>
                      ~{s.wordCount} words
                    </span>
                  </div>
                  {s.preview && (
                    <div className="mt-2 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
                      {s.preview}
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--color-ink-muted)" }}>No sections found for this book.</p>
          )}
        </div>
      )}

      {/* Preview + metadata form */}
      {step === "preview" && (
        <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 360px" }}>
          {/* Passage preview */}
          <div>
            <h2 className="font-serif text-xl font-semibold mb-3" style={{ color: "var(--color-ink)" }}>
              {extracting ? "Extracting..." : extracted ? extracted.title : "Preview"}
            </h2>
            {extracting && (
              <p style={{ color: "var(--color-ink-muted)" }}>
                Fetching text from {selectedBook?.source}...
              </p>
            )}
            {!extracting && extracted && (
              <div
                className="rounded-md border p-6 font-serif leading-relaxed max-h-[600px] overflow-y-auto"
                style={{
                  background: "var(--color-paper)",
                  borderColor: "var(--color-rule)",
                  lineHeight: "1.65",
                  fontSize: "19px",
                }}
              >
                {extracted.body.split("\n\n").map((p, i) => (
                  <p key={i} className="mb-4" style={{ marginBottom: i < extracted.body.split("\n\n").length - 1 ? "1rem" : 0 }}>
                    {p}
                  </p>
                ))}
              </div>
            )}
            {!extracting && !extracted && (
              <p style={{ color: "var(--color-error)" }}>Failed to load preview.</p>
            )}
          </div>

          {/* Metadata sidebar */}
          {extracted && (
            <div>
              <div
                className="rounded-md border p-5 mb-4"
                style={{
                  background: "var(--color-paper)",
                  borderColor: "var(--color-rule)",
                }}
              >
                <h3 className="font-sans text-sm font-semibold mb-3" style={{ color: "var(--color-ink)" }}>
                  Passage info
                </h3>
                <div className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
                  <div className="mb-1">
                    <span className="font-semibold">Source:</span>{" "}
                    {extracted.source}
                  </div>
                  <div className="mb-1">
                    <span className="font-semibold">Author:</span>{" "}
                    {extracted.author}
                  </div>
                  <div className="mb-1">
                    <span className="font-semibold">Words:</span>{" "}
                    {extracted.wordCount}
                  </div>
                </div>
              </div>

              <div
                className="rounded-md border p-5 mb-4"
                style={{
                  background: "var(--color-paper)",
                  borderColor: "var(--color-rule)",
                }}
              >
                <h3 className="font-sans text-sm font-semibold mb-3" style={{ color: "var(--color-ink)" }}>
                  Exam settings
                </h3>

                <div className="grid gap-3">
                  <Field label="Exam boards">
                    <div className="flex gap-2 flex-wrap">
                      {EXAM_BOARDS.map((b) => (
                        <label key={b} className="flex items-center gap-1 text-sm">
                          <input
                            type="checkbox"
                            checked={examBoards.includes(b)}
                            onChange={() =>
                              setExamBoards((prev) =>
                                prev.includes(b)
                                  ? prev.filter((x) => x !== b)
                                  : [...prev, b],
                              )
                            }
                          />
                          {b}
                        </label>
                      ))}
                    </div>
                  </Field>

                  <Field label="Difficulty">
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(Number(e.target.value))}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      style={{
                        borderColor: "var(--color-rule)",
                        background: "var(--color-page)",
                      }}
                    >
                      <option value={1}>1 — Easier</option>
                      <option value={2}>2 — Standard</option>
                      <option value={3}>3 — Stretch</option>
                    </select>
                  </Field>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={ingesting}
                className="w-full px-6 py-3 font-sans font-semibold rounded-md text-base"
                style={{
                  minHeight: 56,
                  background: "var(--color-accent)",
                  color: "var(--color-paper)",
                  opacity: ingesting ? 0.7 : 1,
                }}
              >
                {ingesting ? "Generating..." : "Generate questions"}
              </button>

              {ingestResult && (
                <p className="mt-3 text-sm" style={{ color: "var(--color-accent)" }}>
                  {ingestResult}
                </p>
              )}
              {ingestError && (
                <p className="mt-3 text-sm" style={{ color: "var(--color-error)" }}>
                  {ingestError}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="block">
      <span
        className="block text-xs font-sans font-semibold uppercase tracking-wide mb-1"
        style={{ color: "var(--color-ink-muted)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
