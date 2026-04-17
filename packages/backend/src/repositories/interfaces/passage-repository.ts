import type {
  Passage,
  ExamBoard,
  ContentStatus,
} from "@story-sleuth/shared";

/**
 * Input for creating a passage. Omits server-assigned fields — the
 * implementation generates `id` on first insert, owns `version`
 * increment semantics, and stamps timestamps. `status` defaults to
 * `draft` if not provided (new passages must be reviewed before being
 * served to students).
 */
export interface PassageCreateInput {
  title: string;
  author: string;
  source: string;
  source_url: string;
  year_published: number;
  genre: Passage["genre"];
  subgenre: string;
  exam_boards: ExamBoard[];
  difficulty: Passage["difficulty"];
  reading_level: string;
  word_count: number;
  themes: string[];
  body: string;
  status?: ContentStatus;
  /**
   * When re-ingesting an existing passage (same manifest, updated
   * source text), pass the existing passage `id` so this becomes a
   * new `version` row rather than a new passage entirely.
   */
  existing_id?: string;
}

export interface PassageRepository {
  /** Find by composite key. Returns null if not found. */
  findById(id: string, version: number): Promise<Passage | null>;

  /**
   * Find the latest PUBLISHED version of a passage by id. Used on the
   * student-facing read path; returns null if no version is published.
   */
  findLatestPublishedById(id: string): Promise<Passage | null>;

  /**
   * List published passages available for an exam board. Ordered by
   * difficulty ascending then created_at ascending (stable pagination).
   */
  listPublishedByExamBoard(
    examBoard: ExamBoard,
    limit: number,
    offset: number,
  ): Promise<Passage[]>;

  /** Admin review queue: passages awaiting review, newest first. */
  listPendingReview(limit: number, offset: number): Promise<Passage[]>;

  /** Create a new passage (new id + version 1), or a new version of
   *  an existing passage if `existing_id` is set. Returns the
   *  inserted row. */
  create(input: PassageCreateInput): Promise<Passage>;

  /** Move a passage through the status lifecycle. Stamps
   *  `published_at` when transitioning to 'published'. */
  updateStatus(
    id: string,
    version: number,
    status: ContentStatus,
  ): Promise<Passage>;
}
