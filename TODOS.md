# Story Sleuth TODOs

Captured during /plan-eng-review on 2026-04-16. Phase-1 blockers and deferred work that isn't already in the phased approach in the design doc.

---

## TODO: Session resume UX specification

**What:** Specify what happens when a student returns to a partially completed session.

**Why:** The schema supports save-and-resume (per-question attempt writes), but the user-facing flow is ambiguous. Without a spec, different screens will behave inconsistently. A 10-month-old forgotten session showing up mid-onboarding would be confusing.

**Pros:** Consistent behavior across all session entry points. No ad-hoc decisions when building the UI. Clear expiration rules prevent stale data surprises.

**Cons:** Requires making real product decisions (auto-resume vs prompt, expiration window). 15-30 minutes of thinking.

**Context:** Decisions to make:
- Does the student auto-resume on return, or see a "continue previous session?" prompt?
- Do incomplete sessions expire after N hours (24h? 7 days?) or stay open forever?
- Can a student explicitly abandon a partial session and start fresh?
- What happens if the student starts a NEW session while an old one is still incomplete?

Cross-reference: `student_attempts` table, `sessions.ended_at` column. The UX decision drives whether `sessions.ended_at` is set on explicit completion only, or also on timeout/expiry.

**Depends on:** Nothing. Can be specced anytime before session UI implementation begins.

**Blocks:** Session UI implementation (Phase 1 final step).

---

## TODO: Eval suite rubric formalization

**What:** Write the formal quality rubric for the LLM question generation eval suite.

**Why:** The test plan calls for evals against a "human-reviewer rubric" but the rubric itself isn't written. Without explicit criteria and a pass threshold, eval runs drift — today's pass means something different from last month's pass. Before the first real eval run, the rubric needs to exist in a file in the repo alongside the prompt.

**Pros:** Makes question quality measurable. Enables objective comparison between prompt versions. Catches drift. Creates a clear gate for "is this prompt production-ready?"

**Cons:** Requires domain input (what does a good CEM inference question look like?). Might need sample papers from actual exam boards to benchmark against.

**Context:** The rubric should specify, per question:
- Correct answer is unambiguously correct given the passage text
- Distractors are plausible but clearly wrong on close reading
- Explanation cites specific evidence from the passage (quotes a sentence or references a paragraph)
- question_type tag matches the question structure (retrieval vs inference vs vocab-in-context)
- Reading level of question + options is age-appropriate (no words harder than the passage)
- For exam-board-specific questions: question style matches the board's pattern

Pass threshold: proposed default 8/10 questions per passage meeting all criteria. Benchmark source: Bond 11+ papers and/or CGP sample papers.

File location: `packages/backend/evals/RUBRIC.md`.

**Depends on:** Getting hold of real Bond/CGP sample questions to benchmark against (or generating a synthetic benchmark).

**Blocks:** First real eval suite run. Doesn't block Phase 1 scaffolding or unit tests.

---

## TODO: Emergency passage text backup mechanism

**What:** Add a caching layer so the content pipeline can ingest new passages even if Project Gutenberg is temporarily unavailable.

**Why:** Current design fetches passage text from Gutenberg URLs at ingest time. Existing published passages are safe (text is in Postgres). But a Gutenberg outage (maintenance, DDoS, licensing change) would block adding new content. For a paid product, "we can't add new passages this week" is a real (if low-probability) availability issue.

**Pros:** Insurance against supplier outage. Decouples content pipeline from Gutenberg's uptime. Also faster re-ingestion (local cache hit).

**Cons:** Added operational complexity. Low probability event (Gutenberg is historically reliable). Costs money if cache is in S3.

**Context:** Implementation sketch:
- Periodic cron (weekly?) downloads the full text of every book referenced in `content/passages/*.md` manifests
- Stored in a local directory or S3 bucket with SHA256 checksum
- Content pipeline tries Gutenberg first; falls back to cache if fetch fails
- Admin can manually refresh cache

Cheap alternative: commit the relevant Gutenberg raw files to the repo as LFS blobs. No cron, but bloats the repo.

**Depends on:** Deciding whether operational value justifies the complexity.

**Blocks:** Nothing. Purely a reliability improvement.

---

---

## TODO: Run /design-consultation to produce DESIGN.md

**What:** Produce the authoritative DESIGN.md for story-sleuth. Typefaces (specific names), full color palette with hex values, complete spacing scale (inherit writing-buddy's), line-height scale, component specs (buttons, inputs, cards, question options, passage surface), motion tokens.

**Why:** /plan-design-review locked in DIRECTION (literary app for kids, structural reuse + custom mood) but didn't produce tokens. Without DESIGN.md, implementation defaults to Tailwind + Inter + indigo-500, which produces generic AI-slop SaaS that directly contradicts the design thesis.

**Pros:** Locks visual identity before code. Engineer references DESIGN.md, not guesses. Cross-review skills (/plan-design-review, /design-review) calibrate against it.

**Cons:** 20-30 min design session. Requires some reference searching (what serifs work for kids? what accent colors feel literary without being dull?).

**Context:** Locked direction points:
- Literary app for kids (Oxford Reading Tree meets library website, not Duolingo, not Khan Academy)
- Structural reuse from writing-buddy (spacing, breakpoints, component shapes)
- NEW typography: serif or humanist body for passage (18-20px, 1.6-1.7 line-height, ~65ch line length), quieter sans for UI. NOT Bangers, NOT Comic Neue, NOT Inter.
- NEW palette: warm cream passage surface, low chrome, ONE calm accent color. NOT purple/violet/indigo. Color reserved for state + one highlight.
- Hard rules captured in design doc's "Design Decisions" section.

**Depends on:** Nothing.

**Blocks:** Phase 1 implementation of any UI component. Run before the frontend scaffold.

---

## TODO: Generate visual mockups via /design-shotgun

**What:** Once DESIGN.md exists and an OpenAI API key is configured, generate 3-5 mockup variants each for: student session page, student results page, admin review queue. Compare via the design comparison board, iterate, pick winners.

**Why:** Text-based design review in 2026-04-16 caught the structural gaps, but visual mockups catch what descriptions miss (proportions, breathing room, whether the passage "feels like a book", whether the page actually looks like the thesis or drifts into SaaS-slop).

**Pros:** Visual confidence before writing React. Cross-model AI-slop check. Fast iteration before code.

**Cons:** API cost ($1-2 per mockup round). Extra step before implementation.

**Context:** Prior visual review attempted but the designer binary (`$D`) had no API key. User chose to build story-sleuth itself with multi-provider LLM backend (Qwen first, admin-configurable) — the gstack designer is separate infrastructure and needs its own OpenAI key. See the /plan-design-review session from 2026-04-16 for all approved direction points.

**Depends on:** DESIGN.md (TODO above), OpenAI API key configured for `$D`.

**Blocks:** Nothing critical. Implementation can proceed from ASCII hierarchy if mockups are skipped, but quality risk is higher.

---

## Phase 2 / Phase 3 items already captured in design doc (not duplicated here)

See the design doc at `~/.gstack/projects/story-sleuth/danwa-pre-init-design-20260416-140405.md` for:
- Test mode (Phase 2)
- Adaptive question selection (Phase 2)
- Parent dashboard UI (Phase 2)
- Second exam board (Phase 2)
- Cross-app intelligence (Phase 3)
- Voice comprehension / teach-back (Phase 3)
- BullMQ async job queue (Phase 2+)
- Materialized stats view (Phase 3+)
