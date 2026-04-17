import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ManifestError, ManifestLoader } from "./manifest-loader.js";

describe("ManifestLoader", () => {
  let dir: string;
  let loader: ManifestLoader;

  const validManifest = (
    id: number,
    overrides: Record<string, unknown> = {},
  ): string =>
    [
      "---",
      `id: ${id}`,
      `title: "Test Passage ${id}"`,
      `author: "Test Author"`,
      `source: "Project Gutenberg #${id}"`,
      `source_url: "https://www.gutenberg.org/files/${id}/${id}-0.txt"`,
      `year_published: 1900`,
      `genre: "fiction"`,
      `subgenre: "test"`,
      `difficulty: 2`,
      `exam_boards: ["GL"]`,
      `word_count_target: 500`,
      `reading_level: "Year 5-6"`,
      `themes: ["test"]`,
      `question_types_suitable:`,
      `  - inference`,
      `extract:`,
      `  start_phrase: "once upon a time"`,
      `  end_phrase: "the end."`,
      `  approximate_words: 500`,
      ...Object.entries(overrides).map(
        ([k, v]) => `${k}: ${JSON.stringify(v)}`,
      ),
      "---",
      "",
      "Some notes here.",
      "",
    ].join("\n");

  beforeEach(async () => {
    dir = await mkdir(
      path.join(tmpdir(), `manifest-loader-${Date.now()}-${Math.random()}`),
      { recursive: true },
    ).then((p) => p ?? path.join(tmpdir(), `manifest-loader-${Date.now()}`));
    // mkdir returns the path on create or undefined if it already exists; handle both.
    await mkdir(dir, { recursive: true });
    loader = new ManifestLoader(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("lists manifests in sorted order", async () => {
    await writeFile(path.join(dir, "002.md"), validManifest(2));
    await writeFile(path.join(dir, "001.md"), validManifest(1));
    await writeFile(path.join(dir, "003.md"), validManifest(3));

    const list = await loader.listAll();
    expect(list.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("skips README.md but picks up all other .md files", async () => {
    await writeFile(path.join(dir, "README.md"), "# Not a manifest");
    await writeFile(path.join(dir, "001.md"), validManifest(1));

    const list = await loader.listAll();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(1);
  });

  it("loadById finds a manifest by its frontmatter id", async () => {
    await writeFile(path.join(dir, "001.md"), validManifest(1));
    await writeFile(path.join(dir, "042.md"), validManifest(42));

    const m = await loader.loadById(42);
    expect(m.id).toBe(42);
    expect(m.title).toBe("Test Passage 42");
  });

  it("loadById throws not_found for an unknown id", async () => {
    await writeFile(path.join(dir, "001.md"), validManifest(1));
    await expect(loader.loadById(999)).rejects.toMatchObject({
      name: "ManifestError",
      code: "not_found",
    });
  });

  it("rejects a file with no frontmatter block", async () => {
    await writeFile(
      path.join(dir, "001.md"),
      "# Just a plain markdown file, no frontmatter.",
    );
    await expect(loader.listAll()).rejects.toMatchObject({
      code: "no_frontmatter",
    });
  });

  it("rejects a file with malformed YAML", async () => {
    await writeFile(
      path.join(dir, "001.md"),
      ["---", "id: 1", "  : : bad", "---", ""].join("\n"),
    );
    await expect(loader.listAll()).rejects.toMatchObject({
      code: "yaml_parse_error",
    });
  });

  it("rejects a file that parses but fails schema validation", async () => {
    // missing required fields
    await writeFile(
      path.join(dir, "001.md"),
      ["---", "id: 1", 'title: "Only a title"', "---", ""].join("\n"),
    );
    await expect(loader.listAll()).rejects.toMatchObject({
      code: "schema_validation_error",
    });
  });

  it("directory_read_error when the path doesn't exist", async () => {
    const bad = new ManifestLoader(path.join(dir, "does-not-exist"));
    await expect(bad.listAll()).rejects.toMatchObject({
      code: "directory_read_error",
    });
  });

  it("loads the real 10 repo manifests without error (smoke test)", async () => {
    const realLoader = new ManifestLoader(
      path.resolve(process.cwd(), "../../content/passages"),
    );
    const list = await realLoader.listAll();
    expect(list.length).toBe(10);
    const ids = list.map((m) => m.id);
    expect(new Set(ids).size).toBe(10);
  });
});
