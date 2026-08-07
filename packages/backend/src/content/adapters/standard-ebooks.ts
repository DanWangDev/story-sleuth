import type { ContentAdapter, SearchQuery, SearchResult, Section, ExtractedText } from "./types.js";

/**
 * Standard Ebooks adapter. Standard Ebooks produces professionally
 * cleaned, properly formatted public domain ebooks (~1,500 titles).
 *
 * Data sources (all public, no auth required):
 *   - HTML search: https://standardebooks.org/ebooks?query=...
 *   - Atom feed: https://standardebooks.org/feeds/atom/new-releases
 *   - Single-page HTML: /ebooks/{author}/{title}/text/single-page
 *
 * The OPDS feed requires Patrons Circle membership — we use the HTML
 * search page instead for catalog queries.
 */
export class StandardEbooksAdapter implements ContentAdapter {
  readonly name = "standard-ebooks";
  readonly displayName = "Standard Ebooks";

  private readonly baseUrl = "https://standardebooks.org";

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.q ?? query.title ?? query.author ?? "";
    const url = q
      ? `${this.baseUrl}/ebooks?query=${encodeURIComponent(q)}`
      : `${this.baseUrl}/ebooks`;

    console.log(`[std-ebooks] search: GET ${url}`);

    const res = await fetch(url, {
      headers: { "User-Agent": "story-sleuth/content-pipeline" },
    });

    console.log(`[std-ebooks] search response: HTTP ${res.status}`);
    if (!res.ok) return [];

    const html = await res.text();
    const results = this.parseSearchResults(html);
    console.log(`[std-ebooks] search parsed: ${results.length} results`);
    for (const r of results) {
      console.log(`  - "${r.title}" by ${r.author} [${r.bookId}]`);
    }
    return results;
  }

  async listSections(bookId: string): Promise<Section[]> {
    const htmlUrl = `${this.baseUrl}${bookId}/text/single-page`;
    console.log(`[std-ebooks] listSections: GET ${htmlUrl}`);

    const res = await fetch(htmlUrl, {
      headers: { "User-Agent": "story-sleuth/content-pipeline" },
    });

    console.log(`[std-ebooks] listSections response: HTTP ${res.status}`);
    if (!res.ok) {
      console.log(`[std-ebooks] listSections failed: HTTP ${res.status}`);
      return [];
    }

    const html = await res.text();
    const sections = this.parseSections(html);
    console.log(`[std-ebooks] listSections parsed: ${sections.length} sections`);
    for (const s of sections) {
      console.log(`  - "${s.title}" (${s.wordCount} words)`);
    }
    return sections;
  }

  async extractSection(bookId: string, sectionId: string): Promise<ExtractedText> {
    const htmlUrl = `${this.baseUrl}${bookId}/text/single-page`;
    console.log(`[std-ebooks] extractSection: GET ${htmlUrl} section="${sectionId}"`);

    const res = await fetch(htmlUrl, {
      headers: { "User-Agent": "story-sleuth/content-pipeline" },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${htmlUrl}: HTTP ${res.status}`);
    }

    const html = await res.text();
    const { body, wordCount } = this.extractSectionText(html, sectionId);
    console.log(`[std-ebooks] extractSection done: ${wordCount} words`);

    const pathParts = bookId.replace(/^\/ebooks\//, "").split("/");
    const authorName = pathParts[0]?.replace(/-/g, " ") ?? "";
    const titleSlug = pathParts[1]?.replace(/-/g, " ") ?? "";

    return {
      title: this.titleCase(titleSlug),
      author: this.titleCase(authorName),
      source: "Standard Ebooks",
      sourceUrl: `${this.baseUrl}${bookId}`,
      body,
      wordCount,
    };
  }

  // ── HTML search result parsing ───────────────────────────────

  private parseSearchResults(html: string): SearchResult[] {
    const results: SearchResult[] = [];
    // Standard Ebooks lists books as <li typeof="schema:Book"> elements.
    // Title: <span property="schema:name"> inside the first <p><a>
    // Author: <span property="schema:name"> inside <p class="author"><a>
    // URL: the <a href> inside the first <p>
    const liRe = /<li[^>]*typeof="schema:Book"[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    while ((match = liRe.exec(html)) !== null) {
      const li = match[1]!;

      // Find the book URL from the first <a> in a <p> (not the thumbnail <a>).
      const bookLinkMatch = /<p[^>]*>\s*<a[^>]*href="(\/ebooks\/[^"]+)"[^>]*>/i.exec(li);
      if (!bookLinkMatch) continue;
      const href = bookLinkMatch[1]!;

      // Title from the <span property="schema:name"> inside the book link.
      const titleMatch = /<span[^>]*property="schema:name"[^>]*>([\s\S]*?)<\/span>/i.exec(li);
      const titleText = titleMatch ? this.stripHtml(titleMatch[1]!) : "";

      // Author from <p class="author">.
      const authorBlockMatch = /<p[^>]*class="author"[^>]*>([\s\S]*?)<\/p>/i.exec(li);
      const authorNameMatch = authorBlockMatch
        ? /<span[^>]*property="schema:name"[^>]*>([\s\S]*?)<\/span>/i.exec(authorBlockMatch[1]!)
        : null;
      const author = authorNameMatch ? this.stripHtml(authorNameMatch[1]!) : "Unknown";

      if (!titleText || titleText.length < 2) continue;

      results.push({
        bookId: href,
        title: titleText,
        author,
        source: "Standard Ebooks",
        sourceUrl: `${this.baseUrl}${href}`,
      });
    }
    return results;
  }

  // ── HTML chapter parsing ──────────────────────────────────────

  private parseSections(html: string): Section[] {
    const sections: Section[] = [];
    const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
    if (!bodyMatch) {
      console.log("[std-ebooks] parseSections: no <body> found");
      return sections;
    }

    const body = bodyMatch[1]!;
    // Split on <h2> to get chapter boundaries.
    const chapterRe = /<h2[^>]*>(.*?)<\/h2>([\s\S]*?)(?=<h2[^>]*>|$)/gi;
    let m;
    while ((m = chapterRe.exec(body)) !== null) {
      const heading = this.stripHtml(m[1]!);
      const content = m[2]!;
      const text = this.stripHtml(content);
      const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
      if (wordCount < 20) continue;

      sections.push({
        sectionId: heading,
        title: heading,
        wordCount,
        preview: text.slice(0, 200).replace(/\s+/g, " ").trim(),
      });
    }

    if (sections.length === 0) {
      const text = this.stripHtml(body);
      const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
      if (wordCount >= 20) {
        sections.push({
          sectionId: "full",
          title: "Full text",
          wordCount,
          preview: text.slice(0, 200).replace(/\s+/g, " ").trim(),
        });
      }
    }

    return sections;
  }

  private extractSectionText(
    html: string,
    sectionId: string,
  ): { body: string; wordCount: number } {
    const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
    if (!bodyMatch) throw new Error("No <body> found in HTML");

    const body = bodyMatch[1]!;
    const headingRe = new RegExp(
      `<h2[^>]*>\\s*${this.escapeRegex(sectionId)}\\s*<\\/h2>([\\s\\S]*?)(?=<h2[^>]*>|$)`,
      "i",
    );
    const m = headingRe.exec(body);
    const content = m ? m[1]! : body;
    const text = this.stripHtml(content);
    return {
      body: text,
      wordCount: text.split(/\s+/).filter((w) => w.length > 0).length,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&mdash;/g, "—")
      .replace(/&ndash;/g, "–")
      .replace(/&rsquo;/g, "'")
      .replace(/&lsquo;/g, "'")
      .replace(/&rdquo;/g, '"')
      .replace(/&ldquo;/g, '"')
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private titleCase(s: string): string {
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
