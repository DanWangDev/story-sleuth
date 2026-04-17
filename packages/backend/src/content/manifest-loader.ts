import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import {
  PassageManifestSchema,
  type PassageManifest,
} from "@story-sleuth/shared";

/**
 * Loads passage manifests from `content/passages/*.md`. Each file is
 * markdown with a YAML frontmatter block that matches PassageManifestSchema.
 *
 * The CONTENT_PATH env var pins the directory. In dev the repo root's
 * `content/passages` is the default; in docker it's `/app/content/passages`
 * (set by the Dockerfile).
 */

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

export class ManifestError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "no_frontmatter"
      | "yaml_parse_error"
      | "schema_validation_error"
      | "directory_read_error",
    readonly manifest_id?: number | string,
  ) {
    super(message);
    this.name = "ManifestError";
  }
}

export class ManifestLoader {
  constructor(private readonly content_path: string) {}

  /** List all manifests in the configured directory, parsed + validated. */
  async listAll(): Promise<PassageManifest[]> {
    let entries: string[];
    try {
      entries = await readdir(this.content_path);
    } catch (err) {
      throw new ManifestError(
        `could not read manifest directory ${this.content_path}: ${(err as Error).message}`,
        "directory_read_error",
      );
    }
    const mdFiles = entries
      .filter((e) => e.endsWith(".md") && e !== "README.md")
      .sort();

    const manifests: PassageManifest[] = [];
    for (const file of mdFiles) {
      const m = await this.loadFile(path.join(this.content_path, file));
      manifests.push(m);
    }
    return manifests;
  }

  /** Load a manifest by its `id` field (the zero-padded number). */
  async loadById(id: number): Promise<PassageManifest> {
    const all = await this.listAll();
    const m = all.find((x) => x.id === id);
    if (!m) {
      throw new ManifestError(
        `no manifest with id=${id}`,
        "not_found",
        id,
      );
    }
    return m;
  }

  private async loadFile(file_path: string): Promise<PassageManifest> {
    const raw = await readFile(file_path, "utf8");
    const match = FRONTMATTER_RE.exec(raw);
    if (!match || !match[1]) {
      throw new ManifestError(
        `${path.basename(file_path)} has no YAML frontmatter block`,
        "no_frontmatter",
      );
    }

    let parsed: unknown;
    try {
      parsed = yaml.load(match[1]);
    } catch (err) {
      throw new ManifestError(
        `${path.basename(file_path)} YAML parse error: ${(err as Error).message}`,
        "yaml_parse_error",
      );
    }

    const validated = PassageManifestSchema.safeParse(parsed);
    if (!validated.success) {
      const issues = validated.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new ManifestError(
        `${path.basename(file_path)} failed schema validation:\n${issues}`,
        "schema_validation_error",
      );
    }
    return validated.data;
  }
}
