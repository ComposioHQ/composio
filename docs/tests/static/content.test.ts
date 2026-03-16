/**
 * Content validation tests.
 *
 * Checks that all MDX pages have required frontmatter (title), are non-empty,
 * and changelog entries use valid date formats.
 */
import { describe, test, expect } from "bun:test";
import { readdir, readFile, stat } from "fs/promises";
import { join, relative } from "path";

const DOCS_DIR = join(import.meta.dir, "../../content/docs");
const COOKBOOKS_DIR = join(import.meta.dir, "../../content/cookbooks");
const CHANGELOG_DIR = join(import.meta.dir, "../../content/changelog");

/** Recursively find all .mdx files */
async function findMdxFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findMdxFiles(fullPath)));
    } else if (entry.name.endsWith(".mdx")) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Extract frontmatter from MDX content */
function parseFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fm: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      fm[key] = value;
    }
  }
  return fm;
}

describe("Content - frontmatter validation", () => {
  test("all docs pages have a title", async () => {
    const files = await findMdxFiles(DOCS_DIR);
    const missingTitle: string[] = [];

    for (const file of files) {
      const content = await readFile(file, "utf-8");
      const fm = parseFrontmatter(content);
      if (!fm || !fm.title) {
        missingTitle.push(relative(DOCS_DIR, file));
      }
    }

    expect(missingTitle).toEqual([]);
  });

  test("all cookbooks pages have a title", async () => {
    const files = await findMdxFiles(COOKBOOKS_DIR);
    const missingTitle: string[] = [];

    for (const file of files) {
      const content = await readFile(file, "utf-8");
      const fm = parseFrontmatter(content);
      if (!fm || !fm.title) {
        missingTitle.push(relative(COOKBOOKS_DIR, file));
      }
    }

    expect(missingTitle).toEqual([]);
  });
});

describe("Content - no empty pages", () => {
  test("docs pages have meaningful content (> 50 chars after frontmatter)", async () => {
    const files = await findMdxFiles(DOCS_DIR);
    const empty: string[] = [];

    for (const file of files) {
      const content = await readFile(file, "utf-8");
      // Strip frontmatter
      const body = content.replace(/^---[\s\S]*?---\n*/, "").trim();
      if (body.length < 50) {
        empty.push(relative(DOCS_DIR, file));
      }
    }

    expect(empty).toEqual([]);
  });
});

describe("Content - changelog validation", () => {
  test("changelog files use MM-DD-YY naming pattern", async () => {
    let entries;
    try {
      entries = await readdir(CHANGELOG_DIR);
    } catch {
      return;
    }

    // Files are named MM-DD-YY.mdx or MM-DD-YY-description.mdx
    const nameRegex = /^\d{2}-\d{2}-\d{2}(-[\w-]+)?\.mdx$/;
    const invalid: string[] = [];

    for (const entry of entries) {
      if (entry === "meta.json" || entry === ".DS_Store") continue;
      if (!nameRegex.test(entry)) {
        invalid.push(entry);
      }
    }

    expect(invalid).toEqual([]);
  });

  test("changelog entries have a title and valid YYYY-MM-DD date in frontmatter", async () => {
    let entries;
    try {
      entries = await readdir(CHANGELOG_DIR);
    } catch {
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const errors: string[] = [];

    for (const entry of entries) {
      if (!entry.endsWith(".mdx")) continue;
      const content = await readFile(join(CHANGELOG_DIR, entry), "utf-8");
      const fm = parseFrontmatter(content);

      if (!fm || !fm.title) {
        errors.push(`${entry}: missing title`);
      }

      const dateValue = fm?.date?.replace(/["']/g, "");
      if (!dateValue || !dateRegex.test(dateValue)) {
        errors.push(`${entry}: missing or invalid date (expected YYYY-MM-DD)`);
      } else {
        const parsed = new Date(`${dateValue}T12:00:00`);
        if (isNaN(parsed.getTime())) {
          errors.push(`${entry}: date "${dateValue}" is not a valid calendar date`);
        }
      }
    }

    expect(errors).toEqual([]);
  });
});
