#!/usr/bin/env node
/**
 * Dev-only seed: inserts one fully-populated passage + 4 questions so
 * the student session flow can be driven manually before the real
 * content pipeline (Lane B) lands.
 *
 *   DATABASE_URL=… npm run seed:dev
 *
 * Safe to re-run: uses a fixed id so repeats are idempotent. Does not
 * run in production — fails fast if NODE_ENV=production.
 */
import { loadEnv } from "../config/env.js";
import { createPool } from "../db/pool.js";
import { PostgresPassageRepository } from "../repositories/postgres/postgres-passage-repository.js";
import { PostgresQuestionRepository } from "../repositories/postgres/postgres-question-repository.js";
import { runMigrations } from "../db/migrate.js";

const FIXED_PASSAGE_ID = "00000000-0000-4000-8000-aaaaaaaaaaaa";

async function main(): Promise<void> {
  const env = loadEnv();
  if (env.NODE_ENV === "production") {
    throw new Error("seed-dev-content must not run with NODE_ENV=production");
  }

  const sql = createPool({ connectionString: env.DATABASE_URL });
  try {
    await runMigrations({ sql, silent: true });

    const passages = new PostgresPassageRepository(sql);
    const questions = new PostgresQuestionRepository(sql);

    const existing = await passages.findLatestPublishedById(FIXED_PASSAGE_ID);
    if (existing) {
      console.log(
        `[seed] passage ${FIXED_PASSAGE_ID} already seeded (v${existing.version}). Nothing to do.`,
      );
      return;
    }

    const passage = await passages.create({
      existing_id: FIXED_PASSAGE_ID,
      title: "The River Bank (dev seed)",
      author: "Kenneth Grahame",
      source: "Project Gutenberg #289 (dev seed)",
      source_url: "https://www.gutenberg.org/cache/epub/289/pg289.txt",
      year_published: 1908,
      genre: "fiction",
      subgenre: "classic-british-animal-fantasy",
      exam_boards: ["GL"],
      difficulty: 2,
      reading_level: "Year 5-6",
      word_count: 120,
      themes: ["nature", "friendship", "freedom"],
      body:
        "The Mole had been working very hard all the morning, spring-cleaning his little home. First with brooms, then with dusters; then on ladders and steps and chairs, with a brush and a pail of whitewash; till he had dust in his throat and eyes, and splashes of whitewash all over his black fur, and an aching back and weary arms. Spring was moving in the air above and in the earth below and around him, penetrating even his dark and lowly little house with its spirit of divine discontent and longing.",
      status: "published",
    });
    console.log(`[seed] passage created: ${passage.id} v${passage.version}`);

    const q = await questions.createMany([
      {
        passage_id: passage.id,
        passage_version: passage.version,
        text: "Why does Mole finally stop cleaning and leave the house?",
        question_type: "inference",
        exam_boards: ["GL"],
        difficulty: 2,
        options: [
          {
            letter: "A",
            text: "He finishes all the work",
            explanation_if_chosen:
              "Not quite. The text says he still has dust in his throat and eyes and an aching back — he doesn't finish, he gives up.",
          },
          {
            letter: "B",
            text: "He feels the pull of spring outside",
            explanation_if_chosen:
              "Correct. The passage says 'Spring was moving in the air…' and that even his house couldn't keep that feeling out. That's what drives him out.",
          },
          {
            letter: "C",
            text: "He is chased out by an animal",
            explanation_if_chosen:
              "There's no mention of another animal chasing him. This is only tempting because he leaves in a hurry.",
          },
          {
            letter: "D",
            text: "He runs out of whitewash",
            explanation_if_chosen:
              "The text mentions whitewash splashes on his fur, but not that he runs out of it.",
          },
        ],
        correct_option: "B",
        status: "published",
      },
      {
        passage_id: passage.id,
        passage_version: passage.version,
        text: "What does the phrase 'divine discontent' suggest about Mole's feeling?",
        question_type: "vocabulary-in-context",
        exam_boards: ["GL"],
        difficulty: 3,
        options: [
          {
            letter: "A",
            text: "A mild annoyance",
            explanation_if_chosen:
              "'Divine' lifts the feeling above ordinary annoyance. This is the closest-seeming wrong answer.",
          },
          {
            letter: "B",
            text: "A spiritual, important restlessness",
            explanation_if_chosen:
              "Correct. 'Divine' suggests something sacred or important; 'discontent' means restlessness. Together: a feeling that's bigger than a complaint.",
          },
          {
            letter: "C",
            text: "A religious prayer",
            explanation_if_chosen:
              "'Divine' can mean religious, but 'discontent' is a feeling, not an action. The whole phrase points to a feeling.",
          },
          {
            letter: "D",
            text: "Anger at his house",
            explanation_if_chosen:
              "Anger is too narrow. The passage paints a yearning, not a rage.",
          },
        ],
        correct_option: "B",
        status: "published",
      },
      {
        passage_id: passage.id,
        passage_version: passage.version,
        text: "Which word in the passage most strongly suggests Mole is physically worn out?",
        question_type: "retrieval",
        exam_boards: ["GL"],
        difficulty: 1,
        options: [
          {
            letter: "A",
            text: "divine",
            explanation_if_chosen:
              "'Divine' is about the feeling of spring, not tiredness.",
          },
          {
            letter: "B",
            text: "aching",
            explanation_if_chosen:
              "Correct. 'An aching back and weary arms' tells us directly that Mole's body is tired.",
          },
          {
            letter: "C",
            text: "spring",
            explanation_if_chosen:
              "'Spring' names the season, not tiredness.",
          },
          {
            letter: "D",
            text: "dark",
            explanation_if_chosen:
              "'Dark and lowly' describes his house, not his body.",
          },
        ],
        correct_option: "B",
        status: "published",
      },
      {
        passage_id: passage.id,
        passage_version: passage.version,
        text: "How does the author's description of Mole's house help us understand why he leaves?",
        question_type: "authors-intent",
        exam_boards: ["GL"],
        difficulty: 3,
        options: [
          {
            letter: "A",
            text: "It makes the house sound exciting, so leaving is surprising",
            explanation_if_chosen:
              "The author calls the house 'dark and lowly' — not exciting. That's a clue.",
          },
          {
            letter: "B",
            text: "It makes the house sound confined and dim, so leaving for spring makes sense",
            explanation_if_chosen:
              "Correct. 'Dark and lowly' paints the house as small and gloomy, which contrasts with the freedom of spring outside. The contrast is the point.",
          },
          {
            letter: "C",
            text: "It shows Mole is wealthy",
            explanation_if_chosen:
              "Nothing about the house description suggests wealth.",
          },
          {
            letter: "D",
            text: "It suggests Mole is in danger indoors",
            explanation_if_chosen:
              "There's no hint of danger — just dullness and confinement.",
          },
        ],
        correct_option: "B",
        status: "published",
      },
    ]);
    console.log(`[seed] ${q.length} questions created for passage.`);
    console.log("[seed] done. Start a session with exam_board=GL to see it.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
