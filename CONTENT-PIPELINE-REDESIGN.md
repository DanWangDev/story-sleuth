# Plan: Replace Content Pipeline — From Phrase Matching to Reliable Extraction

## Context

The current passage extraction downloads raw Gutenberg `.txt` files and matches
`start_phrase` / `end_phrase` with `indexOf`. After patching 4 formatting issues
(line wraps, ALL CAPS, carriage returns, typographic characters), 9 of 10
manifests still fail. The approach is fundamentally fragile.

Two things need solving:
1. **Where does the passage text come from?** — live fetch vs stored text
2. **How is it extracted?** — phrase matching vs structured parsing vs direct read

## What we found from web search

**Gutendex** (`https://gutendex.com`) — free, no-key JSON API over 70,000+
Project Gutenberg books. Returns structured metadata + download URLs for all
formats including **HTML**. The HTML format has chapter links and heading
structure — massively more reliable for extraction than raw `.txt`.

**Standard Ebooks** (`https://standardebooks.org`) — professionally cleaned
public domain ebooks with proper chapter structure. Smaller catalog (~1,000
books) but immaculate formatting. Has an API.

**Gutenberg HTML** — the HTML versions of Gutenberg books have `<h2>` chapter
headings, table-of-contents links, and clean paragraph markup. We can parse
chapters from the DOM instead of matching raw text substrings. Much more
reliable.

## Recommended approach: Hybrid

The admin needs two ways to create content:

### Path 1: Browse + fetch (dynamic, for new content)
1. Admin searches Gutendex by title/author → picks a book
2. System fetches the **HTML** version from Gutenberg (not plain text)
3. Parses the HTML to find chapters/sections (using `<h2>` headings and TOC)
4. Admin selects a chapter → system extracts the clean text
5. Generates questions from the extracted text
6. Passage is saved to the DB; `source_url` preserved for provenance

This replaces phrase matching with HTML structure parsing. Chapter headings are
consistent across Gutenberg's HTML format — no more guessing at line breaks,
case, or dash variants.

### Path 2: Paste text (static fallback, for anything)
1. Admin writes a manifest `.md` with metadata
2. Pastes the passage body directly below the `---` frontmatter fence
3. Pipeline reads the body from the file — no fetching, no matching
4. `source_url` stored for provenance

This is the ultimate fallback for content not in Gutenberg, or when the admin
has a specific curated excerpt they want to use.

### What gets deleted
- `passage-fetcher.ts` — the entire fetch-and-match subsystem (~150 lines)
- `passage-fetcher.test.ts`
- The `extract` field from `PassageManifestSchema` (start_phrase, end_phrase, approximate_words)
- The `extract:` block from all 10 manifest `.md` files
- `fetch_error` from `PipelineError.code`

### What gets added
- `passage-browser.ts` — Gutendex search + Gutenberg HTML fetcher + chapter parser
- A "Browse" tab in the admin UI (or integrated into the ingest page)
- `LoadedManifest` type with `body: string` and `body_word_count: number`

### What stays
- `manifest-loader.ts` — simplified to also read body from `.md` files
- `content-pipeline.ts` — simplified: reads body directly instead of fetch+extract
- `question-generator.ts` — completely unchanged
- All 10 manifest `.md` files — updated to include body text
- Review queue, session system — unchanged

## Implementation phases

### Phase A: Static path first (fastest to working content)

This unblocks the 10 existing passages and gets the pipeline working reliably.

1. **Add `body` to manifests** — read body text from below the `---` fence in `.md` files
2. **Simplify pipeline** — remove fetch step, read body directly
3. **Delete `passage-fetcher.ts`** — the entire fragile subsystem
4. **Migration script** — one-off tool that attempts to extract passages using
   the current robust matching, saves results to `.md` files, reports failures
   for manual curation
5. **Update tests**

Files: `manifest-loader.ts`, `content-pipeline.ts`, `passage.ts` (shared schema),
all 10 manifest `.md` files, tests.

### Phase B: Dynamic browse + fetch (later enhancement)

This adds the ability to browse Gutenberg's catalog and fetch clean HTML chapters
without manual curation.

1. **`passage-browser.ts`** — Gutendex API client + Gutenberg HTML parser
2. **`GET /api/admin/browse/books?q=...`** — search Gutendex
3. **`GET /api/admin/browse/books/:id/chapters`** — parse HTML, return chapter list
4. **`POST /api/admin/browse/books/:id/chapters/:n`** — extract chapter text, save as manifest
5. **Admin UI** — "Browse" tab or section with search → select book → select chapter → ingest

Files: new `passage-browser.ts`, new routes, frontend updates.

## Phase A detailed design

### Manifest format change

Before:
```markdown
---
id: 001
title: "The Wind in the Willows — Chapter 1 opening"
extract:
  start_phrase: "The Mole had been working very hard all the morning"
  end_phrase: "sent from the heart of the earth to be told at last to the insatiable sea."
  approximate_words: 700
notes: |
  Mole abandons spring-cleaning...
---
```

After:
```markdown
---
id: 001
title: "The Wind in the Willows — Chapter 1 opening"
author: "Kenneth Grahame"
...
notes: |
  Mole abandons spring-cleaning...
---

The Mole had been working very hard all the morning, spring-cleaning
his little home. First with brooms, then with dusters...

[full passage text with paragraphs separated by blank lines]
```

### Schema change (`packages/shared/src/schemas/passage.ts`)
- Remove `extract` field from `PassageManifestSchema`

### ManifestLoader change (`packages/backend/src/content/manifest-loader.ts`)
- Extract body from below the `---` fence
- Return `LoadedManifest` with `body: string` and `body_word_count: number`
- Error if body is missing or too short (< 50 words)

### ContentPipeline change (`packages/backend/src/content/content-pipeline.ts`)
- Remove `PassageFetcher` import and usage
- Replace Step 3 (fetch+extract) with direct body read
- Log: `[ingest] passage loaded: N words`

### Migration script (one-off, `content/passages/migrate.ts`)
- For each manifest: fetch Gutenberg `.txt`, attempt extraction with current logic
- Save successful extractions to `.md` body
- Report failures for manual curation
- Delete after use

## Files changed (Phase A)

| File | Change |
|------|--------|
| `packages/shared/src/schemas/passage.ts` | Remove `extract` field from schema |
| `packages/backend/src/content/manifest-loader.ts` | Read body, return `LoadedManifest` |
| `packages/backend/src/content/content-pipeline.ts` | Remove fetch step, read body directly |
| `packages/backend/src/content/passage-fetcher.ts` | **Delete** |
| `packages/backend/src/content/passage-fetcher.test.ts` | **Delete** |
| `content/passages/001-*.md` through `010-*.md` | Remove `extract`, add body text |
| `packages/backend/src/content/manifest-loader.test.ts` | Update for new format |
| `packages/backend/src/content/content-pipeline.test.ts` | Remove fetcher references |

## Verification

1. `cd packages/backend && npx vitest run` — all backend tests pass
2. `cd packages/frontend && npx vitest run` — all frontend tests pass
3. Manual: admin can ingest passage #1 without errors (text is in the `.md` file)
4. Manual: generated questions appear in review queue
5. Manual: all 10 manifests can be ingested successfully after migration
