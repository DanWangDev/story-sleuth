import type { ContentAdapter, SearchQuery, SearchResult, Section, ExtractedText } from "./adapters/types.js";

/**
 * Aggregates search and extraction across multiple content adapters.
 * Queries all adapters in parallel and merges results. The admin
 * doesn't need to know which source a book comes from — the browser
 * handles that.
 */
export class ContentBrowser {
  constructor(private readonly adapters: ContentAdapter[]) {}

  /**
   * Search across all adapters. Results are merged and deduplicated
   * by bookId within each source.
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    const results = await Promise.all(
      this.adapters.map(async (a) => {
        try {
          return await a.search(query);
        } catch {
          return [];
        }
      }),
    );
    return results.flat();
  }

  /**
   * List sections for a book from its source adapter.
   */
  async listSections(source: string, bookId: string): Promise<Section[]> {
    const adapter = this.adapters.find((a) => a.name === source);
    if (!adapter) throw new Error(`Unknown source: ${source}`);
    return adapter.listSections(bookId);
  }

  /**
   * Extract text for a section from its source adapter.
   */
  async extractSection(
    source: string,
    bookId: string,
    sectionId: string,
  ): Promise<ExtractedText> {
    const adapter = this.adapters.find((a) => a.name === source);
    if (!adapter) throw new Error(`Unknown source: ${source}`);
    return adapter.extractSection(bookId, sectionId);
  }

  /** List available adapters (for the admin UI source selector). */
  listSources(): Array<{ name: string; displayName: string }> {
    return this.adapters.map((a) => ({
      name: a.name,
      displayName: a.displayName,
    }));
  }
}
