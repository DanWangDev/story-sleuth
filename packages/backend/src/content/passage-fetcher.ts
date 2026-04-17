import type { PassageManifest } from "@story-sleuth/shared";

export class FetchError extends Error {
  constructor(
    message: string,
    readonly code:
      | "network_error"
      | "http_error"
      | "start_phrase_not_found"
      | "end_phrase_not_found"
      | "extract_too_short"
      | "extract_too_long",
    readonly manifest_id: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export interface FetchedPassage {
  body: string;
  word_count: number;
}

/**
 * Fetches a passage's text from its source URL (Project Gutenberg) and
 * slices out the excerpt bounded by manifest.extract.start_phrase and
 * end_phrase. Belt-and-braces sanity: rejects extracts that diverge
 * wildly from the manifest's word-count target — catches the common
 * failure mode where Gutenberg's HTML structure changes and the
 * phrases land outside the intended chapter.
 */
export class PassageFetcher {
  constructor(
    /** Default 30s; individual Gutenberg pulls are ~200KB so this is generous. */
    private readonly timeout_ms: number = 30_000,
    private readonly fetch_impl: typeof fetch = globalThis.fetch,
  ) {}

  async fetch(manifest: PassageManifest): Promise<FetchedPassage> {
    const raw = await this.fetchRaw(manifest);
    return this.extract(raw, manifest);
  }

  private async fetchRaw(manifest: PassageManifest): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout_ms);
    let res: Response;
    try {
      res = await this.fetch_impl(manifest.source_url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "story-sleuth/content-pipeline (+https://github.com/DanWangDev/story-sleuth)",
        },
      });
    } catch (err) {
      clearTimeout(timer);
      throw new FetchError(
        `network error fetching ${manifest.source_url}: ${(err as Error).message}`,
        "network_error",
        manifest.id,
      );
    }
    clearTimeout(timer);

    if (!res.ok) {
      throw new FetchError(
        `${manifest.source_url} returned HTTP ${res.status}`,
        "http_error",
        manifest.id,
      );
    }
    return await res.text();
  }

  /**
   * Pulled out for direct unit testing — no network needed. Public so
   * tests can exercise the slice logic with fixture strings.
   */
  extract(raw: string, manifest: PassageManifest): FetchedPassage {
    const { start_phrase, end_phrase, approximate_words } = manifest.extract;

    const startIdx = raw.indexOf(start_phrase);
    if (startIdx === -1) {
      throw new FetchError(
        `start_phrase not found in ${manifest.source_url}: "${start_phrase.slice(0, 60)}..."`,
        "start_phrase_not_found",
        manifest.id,
      );
    }

    // Look for end_phrase AFTER startIdx so we don't match an earlier occurrence.
    const searchFrom = startIdx + start_phrase.length;
    const endIdx = raw.indexOf(end_phrase, searchFrom);
    if (endIdx === -1) {
      throw new FetchError(
        `end_phrase not found after start_phrase in ${manifest.source_url}`,
        "end_phrase_not_found",
        manifest.id,
      );
    }

    const sliceEnd = endIdx + end_phrase.length;
    const body = raw.slice(startIdx, sliceEnd);
    const cleaned = normaliseWhitespace(body);
    const word_count = countWords(cleaned);

    // Safety rails: if the slice is far off the manifest's target, the
    // phrase boundaries probably matched the wrong section.
    const min = Math.max(10, Math.floor(approximate_words * 0.4));
    const max = Math.ceil(approximate_words * 2.5);
    if (word_count < min) {
      throw new FetchError(
        `extract too short: ${word_count} words (target ~${approximate_words}, min ${min})`,
        "extract_too_short",
        manifest.id,
      );
    }
    if (word_count > max) {
      throw new FetchError(
        `extract too long: ${word_count} words (target ~${approximate_words}, max ${max})`,
        "extract_too_long",
        manifest.id,
      );
    }

    return { body: cleaned, word_count };
  }
}

/**
 * Collapse Gutenberg-style line wraps while preserving paragraph breaks
 * (a blank line). We want the display surface to decide visual wrapping,
 * not the source file's 70-col fill.
 */
function normaliseWhitespace(text: string): string {
  // Normalise line endings.
  const nlNormalised = text.replace(/\r\n/g, "\n");
  // Split on blank lines → paragraphs.
  const paragraphs = nlNormalised.split(/\n\s*\n/);
  // Within each paragraph, fold single newlines to spaces.
  const folded = paragraphs.map((p) => p.replace(/\s*\n\s*/g, " ").trim());
  // Re-join with double newlines so the display can re-paragraph cleanly.
  return folded.filter((p) => p.length > 0).join("\n\n");
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}
