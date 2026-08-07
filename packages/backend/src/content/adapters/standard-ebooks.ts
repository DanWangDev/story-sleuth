import type { ContentAdapter, SearchQuery, SearchResult, Section, ExtractedText } from "./types.js";

/**
 * Standard Ebooks adapter. Standard Ebooks produces professionally
 * cleaned, properly formatted public domain ebooks. Their catalog
 * (~1,500 titles) is smaller than Gutenberg's but the text quality
 * is dramatically better — modern typography, proper chapter structure,
 * consistent HTML markup.
 *
 * Data sources:
 *   - OPDS feed: https://standardebooks.org/feeds/opds
 *   - Book pages: https://standardebooks.org/ebooks/{author}/{title}
 *   - HTML downloads: from the book page's download links
 */
export class StandardEbooksAdapter implements ContentAdapter {
  readonly name = "standard-ebooks";
  readonly displayName = "Standard Ebooks";

  private readonly opdsUrl = "https://standardebooks.org/feeds/opds";

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.q ?? query.title ?? query.author ?? "";
    const url = q
      ? `https://standardebooks.org/feeds/opds/search?query=${encodeURIComponent(q)}`
      : this.opdsUrl;

    const res = await fetch(url, {
      headers: { "User-Agent": "story-sleuth/content-pipeline" },
    });
    if (!res.ok) return [];

    const text = await res.text();
    return this.parseOpdsResults(text);
  }

  async listSections(bookId: string): Promise<Section[]> {
    // bookId is the book's URL path, e.g. "/ebooks/kenneth-grahame/the-wind-in-the-willows"
    const htmlUrl = `https://standardebooks.org${bookId}/text/single-page`;
    const res = await fetch(htmlUrl, {
      headers: { "User-Agent": "story-sleuth/content-pipeline" },
    });
    if (!res.ok) return [];

    const html = await res.text();
    return this.parseSections(html);
  }

  async extractSection(bookId: string, sectionId: string): Promise<ExtractedText> {
    const htmlUrl = `https://standardebooks.org${bookId}/text/single-page`;
    const res = await fetch(htmlUrl, {
      headers: { "User-Agent": "story-sleuth/content-pipeline" },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${htmlUrl}: HTTP ${res.status}`);
    }

    const html = await res.text();
    const { body, wordCount } = this.extractSectionText(html, sectionId);

    // Extract metadata from the page title or the bookId path.
    const pathParts = bookId.replace(/^\/ebooks\//, "").split("/");
    const authorName = pathParts[0]?.replace(/-/g, " ") ?? "";
    const titleSlug = pathParts[1]?.replace(/-/g, " ") ?? "";

    return {
      title: this.titleCase(titleSlug),
      author: this.titleCase(authorName),
      source: "Standard Ebooks",
      sourceUrl: `https://standardebooks.org${bookId}`,
      body,
      wordCount,
    };
  }

  // ── OPDS parsing ──────────────────────────────────────────────

  private parseOpdsResults(xml: string): SearchResult[] {
    const results: SearchResult[] = [];
    // Simple regex-based OPDS entry extraction. The OPDS feed has
    // <entry> elements with <title>, <author>, <id>, <link> children.
    const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    while ((match = entryRe.exec(xml)) !== null) {
      const entry = match[1]!;
      const title = this.tagContent(entry, "title");
      const author = this.tagContent(entry, "author");
      const href = this.opdsLinkHref(entry);
      if (!title || !href) continue;

      results.push({
        bookId: new URL(href).pathname,
        title,
        author: author ?? "Unknown",
        source: "Standard Ebooks",
        sourceUrl: href,
      });
    }
    return results;
  }

  // ── HTML chapter parsing ──────────────────────────────────────

  private parseSections(html: string): Section[] {
    const sections: Section[] = [];
    // Standard Ebooks single-page HTML uses <h2> for chapter headings
    // and <h3> for sub-headings. Each chapter is an <h2> followed by
    // paragraphs until the next <h2>.
    const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
    if (!bodyMatch) return sections;

    const body = bodyMatch[1]!;
    // Split on <h2> to get chapter boundaries.
    const chapterRe = /<h2[^>]*>(.*?)<\/h2>([\s\S]*?)(?=<h2[^>]*>|$)/gi;
    let m;
    while ((m = chapterRe.exec(body)) !== null) {
      const heading = this.stripHtml(m[1]!);
      const content = m[2]!;
      const text = this.stripHtml(content);
      const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
      if (wordCount < 20) continue; // skip very short sections (TOC, etc.)

      sections.push({
        sectionId: heading,
        title: heading,
        wordCount,
        preview: text.slice(0, 200).replace(/\s+/g, " ").trim(),
      });
    }

    // If no <h2> headings found, treat the whole body as one section.
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

    // Find the section by heading text, then extract everything until
    // the next <h2> or end of body.
    const headingRe = new RegExp(
      `<h2[^>]*>\\s*${this.escapeRegex(sectionId)}\\s*<\\/h2>([\\s\\S]*?)(?=<h2[^>]*>|$)`,
      "i",
    );
    const m = headingRe.exec(body);
    if (!m) {
      // Section not found — return entire body.
      const text = this.stripHtml(body);
      return {
        body: text,
        wordCount: text.split(/\s+/).filter((w) => w.length > 0).length,
      };
    }

    const text = this.stripHtml(m[1]!);
    return {
      body: text,
      wordCount: text.split(/\s+/).filter((w) => w.length > 0).length,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────

  private tagContent(xml: string, tag: string): string | null {
    const re = new RegExp(`<${tag}[^>]*>(.*?)<\\/${tag}>`, "is");
    const m = re.exec(xml);
    return m ? this.stripHtml(m[1]!) : null;
  }

  private opdsLinkHref(entry: string): string | null {
    const m = /<link[^>]*href="([^"]*)"[^>]*\/?>/i.exec(entry);
    return m ? m[1]! : null;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, "")     // strip tags
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\n{3,}/g, "\n\n")      // collapse multiple blank lines
      .trim();
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private titleCase(s: string): string {
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
