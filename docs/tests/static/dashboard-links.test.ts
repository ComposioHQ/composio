/**
 * Dashboard link policy tests.
 *
 * Authored content must follow three rules for Composio dashboard links:
 * 1. No app.composio.dev or platform.composio.dev hosts anywhere.
 * 2. Every dashboard.composio.dev link carries utm_source, utm_medium, and
 *    utm_campaign so sign-ups can be attributed to docs.
 * 3. Any dashboard.composio.dev link with a path must be a go-link
 *    (/~/project/... or /~/org/...) or /login, so it resolves to the right
 *    page inside the user's workspace.
 *
 * Code fences and inline mentions are exempt from rules 2-3; rule 1 applies
 * to all file content. content/reference is generated upstream and excluded.
 * TS/TSX is enforced by the no-restricted-syntax rules in .oxlintrc.json.
 */
import { describe, test, expect } from "bun:test";
import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";

const CONTENT_DIRS = ["docs", "examples", "changelog"].map((dir) =>
  join(import.meta.dir, "../../content", dir),
);
const CONTENT_ROOT = join(import.meta.dir, "../../content");

const DASHBOARD_LINK_RE = /\]\((https:\/\/dashboard\.composio\.dev[^)\s]*)\)/g;
const BANNED_HOST_RE = /(?<![a-z0-9-])(?:app|platform)\.composio\.dev/;
const GO_LINK_PATH_RE = /^\/(?:~\/(?:project|org)(?:[/?#]|$)|login(?:[/?#]|$))/;
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

function dashboardLinks(content: string): { line: number; url: string }[] {
  const links: { line: number; url: string }[] = [];
  let inFence = false;
  content.split("\n").forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    for (const match of line.matchAll(DASHBOARD_LINK_RE)) {
      links.push({ line: index + 1, url: match[1] });
    }
  });
  return links;
}

async function collectViolations(
  check: (content: string) => { line: number; url: string }[],
): Promise<string[]> {
  const violations: string[] = [];
  for (const dir of CONTENT_DIRS) {
    for (const file of await findMdxFiles(dir)) {
      const content = await readFile(file, "utf-8");
      for (const violation of check(content)) {
        violations.push(
          `${relative(CONTENT_ROOT, file)}:${violation.line} ${violation.url}`,
        );
      }
    }
  }
  return violations;
}

describe("Content - dashboard link policy", () => {
  test("no app/platform composio hosts anywhere", async () => {
    const banned = await collectViolations((content) => {
      const violations: { line: number; url: string }[] = [];
      content.split("\n").forEach((line, index) => {
        const match = line.match(BANNED_HOST_RE);
        if (match) violations.push({ line: index + 1, url: match[0] });
      });
      return violations;
    });

    expect(
      banned,
      `banned hosts found (use dashboard go-links instead):\n${banned.join("\n")}`,
    ).toEqual([]);
  });

  test("all dashboard links carry utm params", async () => {
    const untagged = await collectViolations((content) =>
      dashboardLinks(content).filter(
        ({ url }) => !REQUIRED_PARAMS.every((param) => url.includes(param)),
      ),
    );

    expect(
      untagged,
      `dashboard links missing utm_source=/utm_medium=/utm_campaign=:\n${untagged.join("\n")}`,
    ).toEqual([]);
  });

  test("all dashboard links with a path are go-links or /login", async () => {
    const invalid = await collectViolations((content) =>
      dashboardLinks(content).filter(({ url }) => {
        const path = url
          .replace(/^https:\/\/dashboard\.composio\.dev/, "")
          .split("?")[0];
        return path !== "" && path !== "/" && !GO_LINK_PATH_RE.test(path);
      }),
    );

    expect(
      invalid,
      `dashboard links must use /~/project/..., /~/org/..., or /login paths:\n${invalid.join("\n")}`,
    ).toEqual([]);
  });
});
