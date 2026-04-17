import { describe, expect, it, vi } from "vitest";
import type { PassageManifest } from "@story-sleuth/shared";
import { FetchError, PassageFetcher } from "./passage-fetcher.js";

const baseManifest: PassageManifest = {
  id: 1,
  title: "The Wind in the Willows",
  author: "Kenneth Grahame",
  source: "Project Gutenberg #289",
  source_url: "https://www.gutenberg.org/files/289/289-0.txt",
  year_published: 1908,
  genre: "fiction",
  subgenre: "classic-british-animal-fantasy",
  difficulty: 2,
  exam_boards: ["GL"],
  word_count_target: 60,
  reading_level: "Year 5-6",
  themes: ["nature", "friendship"],
  question_types_suitable: ["inference"],
  extract: {
    start_phrase: "The Mole had been working very hard",
    end_phrase: "without even waiting to put on his coat.",
    approximate_words: 60,
  },
};

const SAMPLE_BODY = [
  "BEFORE START — boilerplate, table of contents, etc.",
  "",
  "Chapter I.",
  "",
  "The Mole had been working very hard all the morning, spring-cleaning",
  "his little home. First with brooms, then with dusters; then on ladders",
  "and steps and chairs, with a brush and a pail of whitewash; till he had",
  "dust in his throat and eyes, and splashes of whitewash all over his",
  "black fur, and an aching back and weary arms. Spring was moving in the",
  "air above and in the earth below and around him, penetrating even his",
  "dark and lowly little house with its spirit of divine discontent and",
  "longing. It was small wonder, then, that he suddenly flung down his",
  "brush on the floor, said \"Bother!\" and \"O blow!\" and also \"Hang",
  "spring-cleaning!\" and bolted out of the house without even waiting to put on his coat.",
  "",
  "AFTER END — more text, more chapters, a license notice, etc.",
].join("\n");

describe("PassageFetcher.extract", () => {
  const fetcher = new PassageFetcher();

  it("extracts the body between start_phrase and end_phrase", () => {
    const out = fetcher.extract(SAMPLE_BODY, baseManifest);
    expect(out.body).toMatch(/^The Mole had been working very hard/);
    expect(out.body).toMatch(/without even waiting to put on his coat\.$/);
    expect(out.body).not.toMatch(/BEFORE START/);
    expect(out.body).not.toMatch(/AFTER END/);
    expect(out.word_count).toBeGreaterThan(30);
    expect(out.word_count).toBeLessThan(200);
  });

  it("folds Gutenberg-style soft-wraps into paragraph-friendly whitespace", () => {
    const out = fetcher.extract(SAMPLE_BODY, baseManifest);
    // Single-newline folded to space; double-newline (paragraphs)
    // preserved. The fixture has no internal blank line so the whole
    // thing becomes one paragraph.
    expect(out.body).not.toContain("working very hard\nall");
    expect(out.body).toMatch(/working very hard all the morning/);
  });

  it("throws start_phrase_not_found with the manifest id in the error", () => {
    const bad = { ...baseManifest, id: 99 };
    const raw = "This text does not contain the opening phrase.";
    try {
      fetcher.extract(raw, bad);
      expect.fail("expected FetchError");
    } catch (err) {
      expect(err).toBeInstanceOf(FetchError);
      expect((err as FetchError).code).toBe("start_phrase_not_found");
      expect((err as FetchError).manifest_id).toBe(99);
    }
  });

  it("throws end_phrase_not_found when end isn't after start", () => {
    const manifest: PassageManifest = {
      ...baseManifest,
      extract: {
        start_phrase: "The Mole had been working very hard",
        end_phrase: "ZZZ_NEVER_APPEARS_ZZZ",
        approximate_words: 60,
      },
    };
    expect(() => fetcher.extract(SAMPLE_BODY, manifest)).toThrow(
      /end_phrase not found/,
    );
  });

  it("throws extract_too_short when the extract falls below 40% of target", () => {
    const tiny: PassageManifest = {
      ...baseManifest,
      extract: {
        start_phrase: "The Mole had been working very hard",
        end_phrase: "spring-cleaning",
        approximate_words: 500,
      },
    };
    expect(() => fetcher.extract(SAMPLE_BODY, tiny)).toThrow(
      /extract too short/,
    );
  });

  it("throws extract_too_long when the extract is >2.5x target", () => {
    const huge: PassageManifest = {
      ...baseManifest,
      extract: {
        start_phrase: "BEFORE START",
        end_phrase: "on his coat.",
        approximate_words: 10,
      },
    };
    expect(() => fetcher.extract(SAMPLE_BODY, huge)).toThrow(
      /extract too long/,
    );
  });
});

describe("PassageFetcher.fetch (network shape)", () => {
  it("surfaces HTTP 404 as FetchError(http_error)", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    const fetcher = new PassageFetcher(30_000, fetchMock as unknown as typeof fetch);
    await expect(fetcher.fetch(baseManifest)).rejects.toMatchObject({
      name: "FetchError",
      code: "http_error",
    });
  });

  it("surfaces a thrown fetch as FetchError(network_error)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("DNS failure");
    });
    const fetcher = new PassageFetcher(30_000, fetchMock as unknown as typeof fetch);
    await expect(fetcher.fetch(baseManifest)).rejects.toMatchObject({
      code: "network_error",
    });
  });

  it("happy path: 200 + valid body → extracted passage", async () => {
    const fetchMock = vi.fn(async () => new Response(SAMPLE_BODY, { status: 200 }));
    const fetcher = new PassageFetcher(30_000, fetchMock as unknown as typeof fetch);
    const out = await fetcher.fetch(baseManifest);
    expect(out.body).toMatch(/The Mole/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
