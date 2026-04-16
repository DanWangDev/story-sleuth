# Design System — Story Sleuth

## Product Context
- **What this is:** AI-powered 11+ reading comprehension trainer. Students read real literary passages, answer exam-style questions, and receive AI coaching on wrong answers (in results view).
- **Who it's for:** UK children aged 10-11 preparing for 11+ selective grammar school entrance exams. Secondary: their parents, who purchase access and monitor progress.
- **Space/industry:** EdTech, 11+ prep. Peers: Bond and CGP (paper), Atom Learning and 11 Plus Leap (online). Siblings in the Lab F suite: vocab-master, writing-buddy, under 11plus-hub OIDC.
- **Project type:** Web app (React SPA). Tablet-primary (iPad is the study device). Desktop fully supported. Mobile usable but secondary.

## Aesthetic Direction
- **Direction:** Literary Reading Room
- **Decoration level:** Intentional — subtle paper grain on the passage surface, hairline ornamental rules between sections. No decorative blobs, floating circles, wavy SVG dividers, icons-in-circles, or AI-slop patterns.
- **Mood:** Oxford Reading Tree warmth meets a well-designed library website. Serious about content (real literature, real questions), warm in small moments. The student should feel trusted to do real work, never talked down to. Not gamified. Not corporate.
- **Reference mental model:** A well-designed Kindle reader plus a literary magazine layout, tuned for a 10-year-old.
- **Inheritance:** Structural tokens from writing-buddy (spacing scale, breakpoint conventions, 48px touch targets, 16px min body). NOT the Manga Burst aesthetic — wrong for focused reading.

## Typography

### Fonts

- **Display / page headings — Literata** (Google Fonts)
  - Variable font (7-72 opsz axis), weights 400–700
  - Designed by Type Network for Google Books; literally built for long-form reading on screens
  - Used for: page headings, passage titles, passage body, question text in the reading column
- **UI / labels / controls — Source Sans 3** (Google Fonts)
  - Weights 400, 500, 600, 700
  - Humanist sans, readable without Inter's default-ness
  - Used for: navigation, buttons, form labels, metadata, progress indicators
- **Timer / numeric data — IBM Plex Mono** (Google Fonts)
  - Weights 400, 500
  - Tabular numerals, monospaced
  - Used for: session timer, score displays, numeric data tables
  - Stylistic choice — adds a subtle "real test" quality to the timer without going full corporate

### Loading
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;0,7..72,600;0,7..72,700;1,7..72,400&family=Source+Sans+3:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### Fallback Stacks
```css
--font-serif: 'Literata', Georgia, 'Iowan Old Style', serif;
--font-sans:  'Source Sans 3', system-ui, -apple-system, sans-serif;
--font-mono:  'IBM Plex Mono', 'SF Mono', Consolas, monospace;
```

### Type Scale
| Role | Size | Line-height | Weight | Font |
|---|---|---|---|---|
| text-xs | 12px (0.75rem) | 1.4 | 500 | Source Sans 3 — tags, fine metadata |
| text-sm | 14px (0.875rem) | 1.5 | 400 | Source Sans 3 — captions, helper text |
| text-base | 16px (1rem) | 1.5 | 400 | Source Sans 3 — body UI text, button labels |
| text-passage | 19px (1.1875rem) | 1.65 | 400 | Literata — passage body (primary reading) |
| text-lg | 20px (1.25rem) | 1.4 | 600 | Literata — question text, section headings |
| text-xl | 22px (1.375rem) | 1.3 | 600 | Literata — passage title, sub-page headings |
| text-2xl | 28px (1.75rem) | 1.2 | 600 | Literata — page headings |
| text-3xl | 40px (2.5rem) | 1.1 | 700 | Literata — wordmark, hero |
| text-4xl | 48px (3rem) | 1.1 | 600 | Literata — splash, session complete |
| text-mono | 18–32px | 1.2 | 400 | IBM Plex Mono — timer, numeric displays |

### Reading-specific constraints
- Passage body line length: **~65ch max** (roughly 600–700px at 19px)
- Passage body line height: **1.65** (standard readable is 1.5; we go slightly looser for kids)
- Letter-spacing: `-0.01em` on display sizes (22px+), default on body
- Minimum font size for body content: **16px** (never smaller)

## Color

### Approach
Restrained. One accent color (deep teal). Semantic colors used sparingly. Typography does the hierarchy work, color does state work.

### Palette
```css
/* Surfaces */
--paper:        #FAF7F0;  /* Passage surface. Warm cream, like aged book paper */
--page:         #F2ECE0;  /* Page background, slightly deeper */

/* Text */
--ink:          #1F1B16;  /* Primary text. Warm charcoal (not pure black) */
--ink-muted:    #6B6358;  /* UI labels, metadata */
--ink-quiet:    #948B7E;  /* Supporting text, disabled */

/* Accent (the one hero color) */
--accent:       #2E6B5E;  /* Deep teal. Primary actions, focus, links, active nav */
--accent-hover: #244F47;  /* Darker teal for hover */
--accent-soft:  #D9E8E2;  /* Pale mint-teal for subtle backgrounds, selected states */

/* Highlight */
--highlight:    #F3E4B5;  /* Soft gold/straw. Evidence marking in walk-throughs */

/* Semantic */
--success:      #5C8A3A;  /* Muted forest green for correct answers */
--warning:      #B8713A;  /* Warm amber for WRONG answers (learning moment, not punishment) */
--warning-soft: #F3DFC6;  /* Soft amber background for wrong-answer option */
--error:        #A8433A;  /* Muted red. RESERVED for destructive/system errors only */

/* Structure */
--rule:         #E5DED0;  /* Hairline rules between sections */
```

### Contrast (WCAG AA minimum, body AAA where possible)
- Ink on Paper: ~15:1 (AAA)
- Ink-muted on Paper: ~5.5:1 (AA body, AAA large)
- Accent on Paper: ~5.8:1 (AA body)
- Paper on Accent: ~5.8:1 (AA body — for button text)
- Success on Paper: ~4.8:1 (AA body)
- Warning on Paper: ~4.7:1 (AA body)

### Amber-for-wrong-answers (design decision)
Story-sleuth uses warm amber (`#B8713A`) for wrong answers, NOT red. Red triggers anxiety in test-takers and conflicts with the product thesis that wrong answers are learning moments. Amber reads as "attention here" without panic. Error red (`#A8433A`) is reserved for destructive actions and system errors only.

### Dark mode
Not in Phase 1. If added later: re-derive surface colors (not just invert), reduce accent saturation 10-15%, maintain contrast ratios. Paper becomes warm charcoal (`#1F1B16` → deeper tone), ink becomes warm cream.

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable — generous whitespace supporting sustained reading
- **Scale (inherited from writing-buddy):**
  - `2xs: 2px`
  - `xs:  4px`
  - `sm:  8px`
  - `md:  16px`
  - `lg:  24px`
  - `xl:  32px`
  - `2xl: 48px`
  - `3xl: 64px`

## Layout

### Approach
Grid-disciplined. Literary, not editorial. No asymmetry, no overlap, no grid-breaking flourishes. Reading products need predictable structure.

### Grid & Breakpoints
| Breakpoint | Range | Grid | Primary use |
|---|---|---|---|
| Mobile | < 768px | Single column, 16px gutter | Secondary — students use iPads more |
| Tablet | 768–1023px | 2-column 55/45, 24px gutter | **PRIMARY** — iPad is the study device |
| Desktop | ≥ 1024px | 2-column 60/40, 32px gutter | Fully supported |

### Layout constants
- **Max content width:** 1280px (80rem)
- **Passage body width:** max 65ch for reading
- **Touch targets minimum:** 48px (WCAG 2.2 AAA for kids, inherited from writing-buddy)

### Border radius (tighter than writing-buddy — book-like quiet)
- `sm: 4px` — small pills, tags
- `md: 6px` — buttons, input fields, cards
- `lg: 8px` — containers, mockup frames

## Motion

### Approach
Minimal-functional. Transitions aid comprehension. Never decorative. No celebratory animation during focus work.

### Easing
```css
--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);   /* entrances */
--ease-in:  cubic-bezier(0.6, 0, 0.8, 0.2);   /* exits */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);  /* state changes */
```

### Duration
- `micro:  100ms` — hover, focus state changes
- `short:  200ms` — panel reveals, button-press feedback
- `medium: 350ms` — page transitions
- `long:   600ms` — reserved for the one moment of delight (session complete)

### Transition rules
- Hover state transitions: 100ms on background/border/color. Nothing else.
- Button press: no bouncy transforms. A subtle `translateY(1px)` on `:active` is the entire interaction affordance.
- Selected state: 200ms background change from `transparent` to `accent-soft`.
- Coaching card reveal (results page): 350ms fade-up.

### One moment of delight
On session completion (the results page first load), a gentle ink-splash animation on the headline — evokes turning the page of a real book. 600ms, one-time, respects `prefers-reduced-motion`. Everything else in the product is quiet.

### Reduced motion
```css
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
```

## Components

### Buttons
| Variant | Background | Text | Border | Use |
|---|---|---|---|---|
| Primary | `--accent` | `--paper` | none | Primary action: "Submit answer", "Start session" |
| Secondary | transparent | `--accent` | 1.5px `--accent` | Secondary action: "View results", "Edit" |
| Ghost | transparent | `--ink-muted` | none | Tertiary: "Save & exit", "Exit admin" |

All buttons: `min-height: 48px`, `border-radius: 6px`, `font-weight: 600`, `padding: 12px 24px` (or 8px 16px for compact contexts).

### Question option
- Unselected: `border: 1.5px solid var(--rule); background: var(--paper);`
- Hover: `border-color: var(--accent);`
- Selected (during session): `border-color: var(--accent); background: var(--accent-soft);`
- Correct (results view): `border-color: var(--success); background: #EEF4E3;`
- Wrong chosen (results view): `border-color: var(--warning); background: var(--warning-soft);`
- Always: `min-height: 48px`, `padding: 16px`, `border-radius: 6px`

### Coaching card (results view)
- Left border: 3px `--accent` (for "correct") or 3px `--warning` (for "let's look at this together")
- Background: `--page`
- Padding: `16px 24px`
- Rounded: `0 6px 6px 0` (no radius on the bordered edge)
- Label (top): uppercase, 12px, 0.08em letter-spacing, 600 weight, accent color

### Tags (question-type, exam-board)
- Background: `--rule`
- Color: `--ink-muted`
- Padding: `2px 8px`
- Radius: `10px` (pill)
- Font: 11-12px, uppercase, 0.08em letter-spacing, 500 weight

### Passage surface
- Background: `--paper`
- Paper grain: subtle SVG noise overlay at ~3.5% opacity (inline in CSS via data URI)
- Right border: 1px `--rule` (separates from questions column)
- Padding: 32px (desktop), 24px (tablet), 16px (mobile)

### Rules
Hairline ornamental rules between sections:
```css
border-top: 1px solid var(--rule);
margin: 48px 0;
```

## Accessibility (Kids-Specific)
- **Touch targets:** 48px minimum (WCAG 2.2 AAA)
- **Min body text:** 16px (never smaller, not even for metadata)
- **Passage body:** 18-20px (19px chosen) with 1.65 line-height
- **Contrast:** AA minimum everywhere; AAA on primary body text
- **Keyboard navigation:** all actions reachable. Visible focus ring: `2px solid var(--accent)`, 2px offset. Never the browser default `outline`.
- **Screen reader:** semantic HTML — `<article>` for passage, `<fieldset>` + `<legend>` for each question, `<label>` linked to `<input type="radio">` for options. Passage title as `<h2>`, question text as `<p>` inside the fieldset's legend when appropriate.
- **Color never the sole state indicator:** correct/wrong uses ✓/✗ icons AND color AND text label ("You got this one" / "Let's look at this together").
- **Reduced motion:** `prefers-reduced-motion: reduce` disables all transitions and animations.
- **Copy tone:** friendly but not condescending. "Let's look at this together" > "Incorrect." "You got this one" > "Correct!"

## Illustration & Iconography
- **Illustration:** None in Phase 1. No mascots, no decorative characters. The passages and the typography carry the personality.
- **Icons:** Lucide icons at 20-24px, stroke-width 2, color `currentColor`. Used sparingly for functional cues (save, exit, chevrons). No decorative icons, no icons-in-circles.
- **Wordmark:** "Story Sleuth" in Literata 700, with "Sleuth" in `--accent` color. No logo mark in Phase 1.

## Anti-Slop Hard Rules

These are NEVER acceptable in story-sleuth code:

1. No purple, violet, or indigo anywhere in the palette.
2. No 3-column feature grids (especially not on the results page for per-question-type breakdown — use typography).
3. No icons-in-colored-circles as decoration.
4. No image-behind-text hero sections.
5. No centered-everything layouts. Passage left-aligned. UI follows.
6. No emoji in headings or as UI decoration.
7. No default fonts (Inter, Roboto, Arial, system) — use the specified stacks.
8. No placeholder-as-label (labels must be visible when field has content).
9. No floating headings between paragraphs — heading must be visually closer to its section.
10. No "Welcome to Story Sleuth" generic hero copy. Write like a librarian, not a marketer.

## Design Thesis
**The passage is real literature. Design the page like a book, not a SaaS product.**

Every design decision traces back to this. If a choice makes story-sleuth look more like a well-designed book and less like a generic edtech app, it's the right choice.

## Decisions Log
| Date | Decision | Rationale |
|---|---|---|
| 2026-04-16 | Initial design system created | Generated by /design-consultation. Direction: Literary Reading Room. Locked via /office-hours → /plan-eng-review → /plan-design-review → /design-consultation. |
| 2026-04-16 | Literata + Source Sans 3 + IBM Plex Mono | Avoid Inter default. Literata designed for reading; Source Sans 3 pairs cleanly; Plex Mono for "real test" numeric display. |
| 2026-04-16 | Warm cream paper + deep teal accent | Moves away from SaaS-blue and edtech-purple. Matches product thesis. |
| 2026-04-16 | Amber (not red) for wrong answers | Wrong = learning moment, not punishment. Red triggers test anxiety. |
| 2026-04-16 | Structural reuse from writing-buddy | 8px scale, breakpoints, 48px touch targets. Suite consistency without visual conflict. |
| 2026-04-16 | Tighter border-radius than writing-buddy | Book-like quiet. 4/6/8px vs writing-buddy's 6/10/16px. |
| 2026-04-16 | One moment of delight only | Session-complete ink-splash. Everything else is quiet. No gamification. |
