import { describe, it, expect } from "vitest";
import { PassageSchema, PassageManifestSchema } from "./passage.js";

const validPassage = {
  id: "11111111-1111-4111-8111-111111111111",
  version: 1,
  title: "The Wind in the Willows",
  author: "Kenneth Grahame",
  source: "Project Gutenberg #289",
  source_url: "https://www.gutenberg.org/cache/epub/289/pg289.txt",
  year_published: 1908,
  genre: "fiction" as const,
  subgenre: "classic-british-animal-fantasy",
  exam_boards: ["CEM", "ISEB"] as const,
  difficulty: 2 as const,
  reading_level: "Year 5-6",
  word_count: 650,
  themes: ["nature", "friendship", "freedom"],
  body: "The Mole had been working very hard all the morning...",
  status: "published" as const,
  created_at: "2026-04-17T10:00:00.000Z",
  published_at: "2026-04-17T11:00:00.000Z",
};

describe("PassageSchema", () => {
  it("accepts a valid passage", () => {
    expect(PassageSchema.safeParse(validPassage).success).toBe(true);
  });

  it("rejects empty body", () => {
    expect(
      PassageSchema.safeParse({ ...validPassage, body: "" }).success,
    ).toBe(false);
  });

  it("rejects invalid source_url", () => {
    expect(
      PassageSchema.safeParse({ ...validPassage, source_url: "not-a-url" })
        .success,
    ).toBe(false);
  });

  it("rejects zero word_count", () => {
    expect(
      PassageSchema.safeParse({ ...validPassage, word_count: 0 }).success,
    ).toBe(false);
  });

  it("rejects unknown genre", () => {
    expect(
      PassageSchema.safeParse({ ...validPassage, genre: "poetry" }).success,
    ).toBe(false);
  });

  it("rejects version zero", () => {
    expect(
      PassageSchema.safeParse({ ...validPassage, version: 0 }).success,
    ).toBe(false);
  });

  it("allows published_at null on draft passages", () => {
    expect(
      PassageSchema.safeParse({
        ...validPassage,
        status: "draft",
        published_at: null,
      }).success,
    ).toBe(true);
  });

  it("rejects duplicated exam_board more than 3", () => {
    expect(
      PassageSchema.safeParse({
        ...validPassage,
        exam_boards: ["CEM", "GL", "ISEB", "CEM"],
      }).success,
    ).toBe(false);
  });
});

describe("PassageManifestSchema", () => {
  const validManifest = {
    id: 1,
    title: "The Wind in the Willows",
    author: "Kenneth Grahame",
    source: "Project Gutenberg #289",
    source_url: "https://www.gutenberg.org/cache/epub/289/pg289.txt",
    year_published: 1908,
    genre: "fiction",
    subgenre: "classic-british-animal-fantasy",
    difficulty: 2,
    exam_boards: ["CEM", "ISEB"],
    word_count_target: 650,
    reading_level: "Year 5-6",
    themes: ["nature"],
    question_types_suitable: ["inference", "vocabulary-in-context"],
    extract: {
      start_phrase: "The Mole had been working very hard",
      end_phrase: "sent from the heart of the earth",
      approximate_words: 650,
    },
    notes: "Chapter 1 opening",
  };

  it("accepts a valid manifest", () => {
    expect(PassageManifestSchema.safeParse(validManifest).success).toBe(true);
  });

  it("rejects missing extract boundaries", () => {
    const { extract, ...noExtract } = validManifest;
    void extract;
    expect(PassageManifestSchema.safeParse(noExtract).success).toBe(false);
  });

  it("rejects question_types_suitable with an unknown tag", () => {
    expect(
      PassageManifestSchema.safeParse({
        ...validManifest,
        question_types_suitable: ["inference", "trick-question"],
      }).success,
    ).toBe(false);
  });

  it("notes field is optional", () => {
    const { notes: _n, ...noNotes } = validManifest;
    expect(PassageManifestSchema.safeParse(noNotes).success).toBe(true);
  });
});
