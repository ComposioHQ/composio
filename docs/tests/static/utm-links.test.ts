/**
 * UTM attribution tests.
 *
 * Every markdown link to dashboard.composio.dev in authored content must carry
 * utm_source, utm_medium, and utm_campaign so sign-ups can be attributed to
 * docs. Code fences and inline mentions are exempt; content/reference is
 * generated upstream and excluded. TS/TSX links are enforced by the
 * no-restricted-syntax rule in eslint.config.mjs.
 */
import { describe, test, expect } from "bun:test";
import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";

const CONTENT_DIRS = ["docs", "examples", "changelog"].map((dir) =>
  join(import.meta.dir, "../../content", dir),
);
const CONTENT_ROOT = join(import.meta.dir, "../../content");

const DASHBOARD_LINK_RE = /\]\((https:\/\/dashboard\.composio\.dev[^)\s]*)\)/g;
const REQUIRED_PARAMS = ["utm_source=", "utm_medium=", "utm_campaign="];

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

function findUntaggedLinks(content: string): { line: number; url: string }[] {
  const violations: { line: number; url: string }[] = [];
  let inFence = false;
  content.split("\n").forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    for (const match of line.matchAll(DASHBOARD_LINK_RE)) {
      const url = match[1];
      if (!REQUIRED_PARAMS.every((param) => url.includes(param))) {
        violations.push({ line: index + 1, url });
      }
    }
  });
  return violations;
}

describe("Content - dashboard link UTM attribution", () => {
  test("all dashboard links carry utm params", async () => {
    const untagged: string[] = [];

    for (const dir of CONTENT_DIRS) {
      for (const file of await findMdxFiles(dir)) {
        const content = await readFile(file, "utf-8");
        for (const violation of findUntaggedLinks(content)) {
          untagged.push(
            `${relative(CONTENT_ROOT, file)}:${violation.line} ${violation.url}`,
          );
        }
      }
    }

    expect(
      untagged,
      `dashboard links missing utm_source=/utm_medium=/utm_campaign=:\n${untagged.join("\n")}`,
    ).toEqual([]);
  });
});
