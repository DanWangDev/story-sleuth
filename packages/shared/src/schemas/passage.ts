import { z } from "zod";
import { ContentStatusSchema, GenreSchema } from "../enums.js";
import {
  DifficultySchema,
  ExamBoardSchema,
  QuestionTypeSchema,
} from "../taxonomy.js";

/**
 * A passage of literary text used as the source material for comprehension
 * questions. Passages are immutable snapshots once published — re-ingesting
 * a manifest creates a new `version` rather than mutating the existing row.
 *
 * Attempts (student_attempts) pin to a specific (passage_id, passage_version)
 * so re-publishing never invalidates historical stats.
 */
export const PassageSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),

  title: z.string().min(1).max(500),
  author: z.string().min(1).max(200),
  source: z.string().min(1).max(200),
  source_url: z.string().url(),
  year_published: z.number().int().min(1000).max(3000),

  genre: GenreSchema,
  subgenre: z.string().min(1).max(100),

  exam_boards: z.array(ExamBoardSchema).nonempty().max(3),
  difficulty: DifficultySchema,

  reading_level: z.string().min(1).max(50),
  word_count: z.number().int().positive(),

  themes: z.array(z.string().min(1)).max(20),

  /** The extracted passage text (the thing the student actually reads). */
  body: z.string().min(1),

  status: ContentStatusSchema,

  created_at: z.string().datetime(),
  published_at: z.string().datetime().nullable(),
});

export type Passage = z.infer<typeof PassageSchema>;

/**
 * Shape of the manifest files committed to `content/passages/*.md`. The
 * content pipeline reads the passage text from a content adapter (Standard
 * Ebooks, Wikisource, etc.) and produces a Passage entity.
 *
 * `source_url` is provenance metadata, NOT a runtime dependency — the
 * pipeline never fetches from it directly.
 */
export const PassageManifestSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  author: z.string().min(1),
  source: z.string().min(1),
  source_url: z.string().url(),
  year_published: z.number().int(),
  genre: GenreSchema,
  subgenre: z.string(),
  difficulty: DifficultySchema,
  exam_boards: z.array(ExamBoardSchema).nonempty(),
  word_count_target: z.number().int().positive(),
  reading_level: z.string(),
  themes: z.array(z.string()),
  question_types_suitable: z.array(QuestionTypeSchema),
  notes: z.string().optional(),
});

export type PassageManifest = z.infer<typeof PassageManifestSchema>;
