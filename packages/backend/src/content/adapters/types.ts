/**
 * Content adapter interface. Each content source (Standard Ebooks,
 * Wikisource, Gutenberg, etc.) implements this interface so the
 * ContentBrowser can search and extract text uniformly.
 */

export interface SearchQuery {
  title?: string;
  author?: string;
  /** Free-text search across title, author, and description. */
  q?: string;
}

export interface SearchResult {
  bookId: string;
  title: string;
  author: string;
  source: string;
  sourceUrl: string;
  yearPublished?: number;
  genre?: string;
}

export interface Section {
  sectionId: string;
  title: string;
  wordCount: number;
  /** First ~100 words for preview. */
  preview?: string;
}

export interface ExtractedText {
  title: string;
  author: string;
  source: string;
  sourceUrl: string;
  body: string;
  wordCount: number;
}

export interface ContentAdapter {
  readonly name: string;
  /** Display name shown in the admin UI. */
  readonly displayName: string;

  /**
   * Search the catalog. Returns matching books with metadata.
   * An empty query returns popular/recent books for browsing.
   */
  search(query: SearchQuery): Promise<SearchResult[]>;

  /**
   * List sections (chapters, lectures, letters, etc.) for a book.
   * Each section includes a word count so the admin can pick one
   * in the right length range.
   */
  listSections(bookId: string): Promise<Section[]>;

  /**
   * Extract clean text for a specific section. Returns plain text
   * with paragraphs separated by double newlines.
   */
  extractSection(bookId: string, sectionId: string): Promise<ExtractedText>;
}
