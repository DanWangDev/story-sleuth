import { z } from "zod";

/**
 * Option letter for multiple-choice questions. Phase 1 is always 4 options
 * (A-D). Kept as a named enum so later expansion to true/false or 5+ options
 * is an additive change, not a schema rewrite.
 */
export const OptionLetterSchema = z.enum(["A", "B", "C", "D"]);
export type OptionLetter = z.infer<typeof OptionLetterSchema>;

/**
 * Publication status for passages and questions. Admin workflow:
 *   draft → pending_review → published
 *   published → archived (never back to draft, never shown to students)
 */
export const ContentStatusSchema = z.enum([
  "draft",
  "pending_review",
  "published",
  "archived",
]);
export type ContentStatus = z.infer<typeof ContentStatusSchema>;

/**
 * Session mode. Practice = coaching-forward. Test = exam simulation.
 * Affects timer presence, hint availability, feedback delivery timing.
 */
export const SessionModeSchema = z.enum(["practice", "test"]);
export type SessionMode = z.infer<typeof SessionModeSchema>;

/**
 * Top-level passage genre. Fiction vs non-fiction is the coarsest split
 * and matches how 11+ prep material is typically organised.
 */
export const GenreSchema = z.enum(["fiction", "non-fiction"]);
export type Genre = z.infer<typeof GenreSchema>;

/**
 * Admin ingest job lifecycle.
 */
export const IngestJobStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);
export type IngestJobStatus = z.infer<typeof IngestJobStatusSchema>;
