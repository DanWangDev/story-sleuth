import type {
  Question,
  QuestionOption,
  QuestionType,
  ExamBoard,
  ContentStatus,
  OptionLetter,
} from "@story-sleuth/shared";

export interface QuestionCreateInput {
  passage_id: string;
  passage_version: number;
  text: string;
  question_type: QuestionType;
  exam_boards: ExamBoard[];
  difficulty: Question["difficulty"];
  options: QuestionOption[];
  correct_option: OptionLetter;
  status?: ContentStatus;
}

export interface QuestionRepository {
  findById(id: string): Promise<Question | null>;

  /** All questions for a passage version, optionally filtered by status. */
  findByPassage(
    passage_id: string,
    passage_version: number,
    status?: ContentStatus,
  ): Promise<Question[]>;

  /**
   * The question set for a session — resolves the session's question_ids
   * array to full Question rows, preserving the session's order.
   */
  findBySessionQuestionIds(ids: string[]): Promise<Question[]>;

  /** Admin review queue: oldest pending first, so drafts don't starve. */
  listPendingReview(limit: number, offset: number): Promise<Question[]>;

  /** Bulk insert — used by the content pipeline to write a batch of
   *  generated questions for a newly ingested passage. */
  createMany(inputs: QuestionCreateInput[]): Promise<Question[]>;

  updateStatus(id: string, status: ContentStatus): Promise<Question>;
}
