import type postgres from "postgres";
import type { PassageCreateInput } from "../interfaces/passage-repository.js";
import type { QuestionCreateInput } from "../interfaces/question-repository.js";
import type { QuestionOption, ExamBoard } from "@story-sleuth/shared";
import { PostgresPassageRepository } from "./postgres-passage-repository.js";
import { PostgresQuestionRepository } from "./postgres-question-repository.js";
import { PostgresUserMappingRepository } from "./postgres-user-mapping-repository.js";
import { runMigrations } from "../../db/migrate.js";

/**
 * Shared test helpers. Keep tests readable by hiding the bulky valid
 * INSERT payloads for passages and questions; callers only override the
 * fields they care about.
 */

export async function resetAndMigrate(sql: postgres.Sql): Promise<void> {
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await sql.unsafe("CREATE SCHEMA public");
  await runMigrations({ sql, silent: true });
}

export function validOption(
  letter: "A" | "B" | "C" | "D",
  text = `option ${letter}`,
): QuestionOption {
  return {
    letter,
    text,
    explanation_if_chosen: `explanation for ${letter}`,
  };
}

export function passageCreateInput(
  overrides: Partial<PassageCreateInput> = {},
): PassageCreateInput {
  const boards: ExamBoard[] = overrides.exam_boards ?? ["GL"];
  return {
    title: overrides.title ?? "Test Passage",
    author: overrides.author ?? "Test Author",
    source: overrides.source ?? "Test Source",
    source_url: overrides.source_url ?? "https://example.com/passage",
    year_published: overrides.year_published ?? 1900,
    genre: overrides.genre ?? "fiction",
    subgenre: overrides.subgenre ?? "test",
    exam_boards: boards,
    difficulty: overrides.difficulty ?? 2,
    reading_level: overrides.reading_level ?? "Year 5-6",
    word_count: overrides.word_count ?? 500,
    themes: overrides.themes ?? ["test-theme"],
    body: overrides.body ?? "passage body text",
    status: overrides.status,
    existing_id: overrides.existing_id,
  };
}

export function questionCreateInput(
  passage_id: string,
  passage_version: number,
  overrides: Partial<QuestionCreateInput> = {},
): QuestionCreateInput {
  return {
    passage_id,
    passage_version,
    text: overrides.text ?? "What is this about?",
    question_type: overrides.question_type ?? "inference",
    exam_boards: overrides.exam_boards ?? ["GL"],
    difficulty: overrides.difficulty ?? 2,
    options:
      overrides.options ??
      [validOption("A"), validOption("B"), validOption("C"), validOption("D")],
    correct_option: overrides.correct_option ?? "B",
    status: overrides.status,
  };
}

/**
 * One-call setup helper for tests that need "some published content to
 * reference" — creates a user_mapping, a published passage, and N
 * published questions tied to it. Returns all the identifiers.
 */
export async function seedPublishedContent(
  sql: postgres.Sql,
  questionCount = 4,
): Promise<{
  user_id: number;
  passage_id: string;
  passage_version: number;
  question_ids: string[];
}> {
  const userRepo = new PostgresUserMappingRepository(sql);
  const passageRepo = new PostgresPassageRepository(sql);
  const questionRepo = new PostgresQuestionRepository(sql);

  const user = await userRepo.getOrCreate(
    `test-user-${Math.random().toString(36).slice(2)}`,
  );
  const passage = await passageRepo.create(
    passageCreateInput({ status: "published" }),
  );
  const questions = await questionRepo.createMany(
    Array.from({ length: questionCount }, () =>
      questionCreateInput(passage.id, passage.version, { status: "published" }),
    ),
  );

  return {
    user_id: user.id,
    passage_id: passage.id,
    passage_version: passage.version,
    question_ids: questions.map((q) => q.id),
  };
}
