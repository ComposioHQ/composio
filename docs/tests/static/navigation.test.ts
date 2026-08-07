/**
 * Navigation completeness tests.
 *
 * Validates that every entry in meta.json files maps to a real .mdx file or
 * directory, and that every content file is referenced in its parent meta.json.
 */
import { describe, test, expect } from "bun:test";
import { readdir, readFile, stat } from "fs/promises";
import { join, basename, dirname, relative } from "path";
import { HOME_INTENTS } from "../../lib/home-navigation";

const CONTENT_DIR = join(import.meta.dir, "../../content/docs");

/** Separator entries in meta.json start with --- */
function isSeparator(entry: string): boolean {
  return entry.startsWith("---");
}

/** Recursively find all meta.json files under a directory */
async function findMetaFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findMetaFiles(fullPath)));
    } else if (entry.name === "meta.json") {
      results.push(fullPath);
    }
  }
  return results;
}

/** Recursively find authored MDX pages under a directory. */
async function findMdxFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

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

/** Check if a path exists as a file or directory */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Pages can opt out of the sidebar when a visible hub links to them. */
async function isHiddenFromSidebar(path: string): Promise<boolean> {
  if (!path.endsWith('.mdx')) return false;
  const content = await readFile(path, 'utf-8');
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  return /^sidebar:\s*false\s*$/m.test(frontmatter);
}

describe("Navigation - meta.json validity", () => {
  test("root navigation uses progressive Start, Core concepts, and Guides sections", async () => {
    const metaPath = join(CONTENT_DIR, "meta.json");
    const meta = JSON.parse(await readFile(metaPath, "utf-8"));
    const pages = meta.pages as string[];
    const separators = pages.filter(isSeparator);

    expect(separators).toEqual([
      "---Get Started---",
      "---Core concepts---",
      "---Guides---",
    ]);

    const coreIndex = pages.indexOf("---Core concepts---");
    const guidesIndex = pages.indexOf("---Guides---");
    const getStartedPages = pages.slice(1, coreIndex);
    expect(getStartedPages).toEqual([
      "index",
      "quickstart",
      "providers",
      "sessions-via-mcp",
      "composio-connect",
      "cli",
    ]);

    expect(pages.slice(coreIndex + 1, guidesIndex)).toEqual([
      "how-composio-works",
      "configuring-sessions",
      "authentication",
      "triggers",
    ]);

    expect(pages.slice(guidesIndex + 1)).toEqual([
      "sandbox",
      "extending-sessions",
      "setting-up-triggers",
      "sessions-vs-direct-execution",
      "tools-direct",
      "auth-configuration",
      "migration-guide",
      "security",
    ]);
  });

  test("root meta.json entries all resolve to files or directories", async () => {
    const metaPath = join(CONTENT_DIR, "meta.json");
    const meta = JSON.parse(await readFile(metaPath, "utf-8"));
    const missing: string[] = [];

    for (const entry of meta.pages as string[]) {
      if (isSeparator(entry)) continue;
      if (entry === "...") continue;

      const asFile = join(CONTENT_DIR, `${entry}.mdx`);
      const asDir = join(CONTENT_DIR, entry);

      const fileExists = await exists(asFile);
      const dirExists = await exists(asDir);

      if (!fileExists && !dirExists) {
        missing.push(entry);
      }
    }

    expect(missing).toEqual([]);
  });

  test("all nested meta.json entries resolve to files or directories", async () => {
    const metaFiles = await findMetaFiles(CONTENT_DIR);
    const errors: string[] = [];

    for (const metaPath of metaFiles) {
      const dir = dirname(metaPath);
      const meta = JSON.parse(await readFile(metaPath, "utf-8"));
      const relDir = relative(CONTENT_DIR, dir);

      for (const entry of (meta.pages || []) as string[]) {
        if (isSeparator(entry)) continue;

        // Handle "..." (rest) entries which are valid fumadocs syntax
        if (entry === "...") continue;

        const asFile = join(dir, `${entry}.mdx`);
        const asDir = join(dir, entry);

        const fileExists = await exists(asFile);
        const dirExists = await exists(asDir);

        if (!fileExists && !dirExists) {
          errors.push(`${relDir}/meta.json → "${entry}" (no .mdx file or directory found)`);
        }
      }
    }

    expect(errors).toEqual([]);
  });

  test("no orphan .mdx files missing from meta.json", async () => {
    const metaFiles = await findMetaFiles(CONTENT_DIR);
    const orphans: string[] = [];

    // Check root level
    const rootMetaPath = join(CONTENT_DIR, "meta.json");
    const rootMeta = JSON.parse(await readFile(rootMetaPath, "utf-8"));
    const rootEntries = new Set(
      (rootMeta.pages as string[]).filter((e: string) => !isSeparator(e) && e !== "...")
    );
    // "..." means "include everything else", so skip orphan check for root
    if (rootEntries.has("...")) return;
    const rootFiles = await readdir(CONTENT_DIR, { withFileTypes: true });

    for (const file of rootFiles) {
      if (file.name === "meta.json") continue;
      const name = file.isFile() ? basename(file.name, ".mdx") : file.name;
      if (file.isFile() && !file.name.endsWith(".mdx")) continue;
      if (!rootEntries.has(name)) {
        if (await isHiddenFromSidebar(join(CONTENT_DIR, file.name))) continue;
        orphans.push(`docs/${file.name}`);
      }
    }

    // Check each nested directory that has a meta.json
    for (const metaPath of metaFiles) {
      if (metaPath === rootMetaPath) continue;
      const dir = dirname(metaPath);
      const meta = JSON.parse(await readFile(metaPath, "utf-8"));
      const entries = new Set(
        ((meta.pages || []) as string[]).filter((e: string) => !isSeparator(e))
      );
      // "..." means "include everything else", so skip orphan check
      if (entries.has("...")) continue;

      const files = await readdir(dir, { withFileTypes: true });
      const relDir = relative(CONTENT_DIR, dir);

      for (const file of files) {
        if (file.name === "meta.json") continue;
        const name = file.isFile() ? basename(file.name, ".mdx") : file.name;
        if (file.isFile() && !file.name.endsWith(".mdx")) continue;
        if (!entries.has(name)) {
          if (await isHiddenFromSidebar(join(dir, file.name))) continue;
          orphans.push(`${relDir}/${file.name}`);
        }
      }
    }

    if (orphans.length > 0) {
      console.warn(
        `Found ${orphans.length} orphan file(s) not in any meta.json:\n` +
          orphans.map((o) => `  - ${o}`).join("\n")
      );
    }
    // The single-toolkit MCP page stays deliberately deferred until its
    // product status is resolved. Other pages outside the sidebar opt out in
    // frontmatter and remain reachable from a visible hub.
    expect(orphans.sort()).toEqual(["docs/single-toolkit-mcp.mdx"]);
  });

  test("pages hidden from the sidebar remain linked from visible content", async () => {
    const mdxFiles = await findMdxFiles(CONTENT_DIR);
    const linkedRoutes = new Set(
      HOME_INTENTS.flatMap((intent) => intent.links.map((link) => link.href)),
    );
    const hiddenRoutes: string[] = [];

    for (const file of mdxFiles) {
      const content = await readFile(file, "utf-8");
      for (const match of content.matchAll(/(?:\]\(|href=")(?<href>\/docs\/[A-Za-z0-9/_-]+)/g)) {
        linkedRoutes.add(match.groups!.href);
      }

      if (await isHiddenFromSidebar(file)) {
        const route = relative(CONTENT_DIR, file)
          .replace(/\.mdx$/, "")
          .replace(/\/index$/, "");
        hiddenRoutes.push(`/docs/${route}`);
      }
    }

    expect(hiddenRoutes.length).toBeGreaterThan(0);
    expect(hiddenRoutes.filter((route) => !linkedRoutes.has(route))).toEqual([]);
  });
});
