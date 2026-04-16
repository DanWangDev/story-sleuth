# Seed Passages

Hand-curated passages from public domain sources for the story-sleuth content pipeline.

## Source

All passages are from [Project Gutenberg](https://www.gutenberg.org/) and are in the public domain in the UK and US. No copyright or licensing concerns.

## File format

Each passage is a markdown file with YAML frontmatter. The frontmatter captures metadata used by the question generation pipeline and the adaptive engine. The body is the passage text as it should appear to the student.

```yaml
---
id: 001
title: "..."
author: "..."
source: "Project Gutenberg #NNN"
source_url: "https://www.gutenberg.org/..."
year_published: YYYY
genre: "fiction" | "non-fiction"
subgenre: "..."
difficulty: 1 | 2 | 3
exam_boards: ["CEM", "GL", "ISEB"]
word_count: NNN
reading_level: "Year 5-6"
themes: ["...", "..."]
question_types_suitable:
  - retrieval
  - inference
  - vocabulary-in-context
  - author's-intent
  - figurative-language
  - structure-and-organization
---
```

## Difficulty scale

- **1** — Accessible Year 5 level. Simple sentence structure, straightforward vocabulary, clear narrative or exposition.
- **2** — Solid Year 5-6 level. Some challenging vocabulary, requires inference, figurative language present.
- **3** — Stretch Year 6 level. Complex sentences, dense vocabulary, heavy inference, Victorian or period prose.

## Exam board notes

- **CEM** — emphasizes inference, deduction, figurative language, author's intent. Non-standard question formats. Good for literary fiction with rich description.
- **GL** — vocabulary-heavy, standardized multiple-choice. Retrieval and vocabulary-in-context questions dominate. Good for passages with varied precise vocabulary.
- **ISEB** — used by independent schools. Mix of question types, sometimes open-ended. Good for passages with clear structure and strong themes.

A passage can be suitable for multiple exam boards; the tag indicates which styles it supports best.

## Curation principles

1. **Authentic literature, not generated prose.** Real published writing is what the exam tests.
2. **Variety of genre and tone.** Fiction (classic British, adventure, domestic, imaginative) and non-fiction (scientific, biographical, exploration, natural history).
3. **Rich material for multiple question types.** A passage should support retrieval questions (facts on the page), inference questions (things implied), and vocabulary questions (words used in context).
4. **~500-800 words per excerpt.** Matches typical 11+ comprehension passage length.
