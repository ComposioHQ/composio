/**
 * Toolkit-version policy for direct-execution samples.
 *
 * Direct tool execution requires a toolkit version — `tools.execute()`
 * without one raises ToolVersionRequiredError at runtime. A 97-run agent
 * eval of the docs found the top failure (72/97 runs) was readers copying
 * version-less `tools.execute()` samples.
 *
 * Rule: any authored MDX page whose code fences call `tools.execute(` must
 * also show version configuration somewhere in its code fences — one of
 * `toolkit_versions` / `toolkitVersions` (constructor), `version=` /
 * `version:` (per-call), or a `COMPOSIO_TOOLKIT_VERSION_*` env var.
 *
 * Scope: content/docs and content/examples. Excluded: content/reference
 * (generated upstream), changelog (historical records), and
 * docs/migration-guide (point-in-time documents that may show old APIs).
 * The LLM guardrail blocks appended to .md responses are checked too —
 * they are samples agents copy verbatim.
 */
import { describe, test, expect } from "bun:test";
import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";

import {
  SESSION_GUARDRAILS,
  DIRECT_EXECUTION_GUARDRAILS,
} from "../../lib/llm-guardrails";

const CONTENT_DIRS = ["docs", "examples"].map((dir) =>
  join(import.meta.dir, "../../content", dir),
);
const CONTENT_ROOT = join(import.meta.dir, "../../content");
const EXCLUDED_PATH_SEGMENTS = ["docs/migration-guide/"];

const EXECUTE_CALL_RE = /\btools\.execute\s*\(/;
const VERSION_TOKEN_RE =
  /toolkit_versions|toolkitVersions|version\s*[=:]|COMPOSIO_TOOLKIT_VERSION_|dangerously_skip_version_check|dangerouslySkipVersionCheck/;

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

/** Concatenated contents of all fenced code blocks in a document. */
function fencedCode(content: string): string {
  const fences: string[] = [];
  let inFence = false;
  for (const line of content.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) fences.push(line);
  }
  return fences.join("\n");
}

function violates(content: string): boolean {
  const code = fencedCode(content);
  return EXECUTE_CALL_RE.test(code) && !VERSION_TOKEN_RE.test(code);
}

describe("direct-execution samples show toolkit versions", () => {
  test("every authored page with a tools.execute() sample shows version configuration", async () => {
    const files = (
      await Promise.all(CONTENT_DIRS.map((dir) => findMdxFiles(dir)))
    ).flat();
    const failures: string[] = [];

    for (const file of files) {
      const relPath = relative(CONTENT_ROOT, file);
      if (EXCLUDED_PATH_SEGMENTS.some((seg) => relPath.startsWith(seg))) {
        continue;
      }
      const content = await readFile(file, "utf-8");
      if (violates(content)) {
        failures.push(relPath);
      }
    }

    expect(
      failures,
      `Pages with tools.execute() samples but no version configuration ` +
        `(add toolkit_versions/toolkitVersions to the constructor or ` +
        `version= per call — see /docs/tools-direct/toolkit-versioning):\n` +
        failures.map((f) => `  - ${f}`).join("\n"),
    ).toEqual([]);
  });

  test("LLM guardrail blocks with tools.execute() samples show version configuration", () => {
    for (const [name, guardrails] of [
      ["SESSION_GUARDRAILS", SESSION_GUARDRAILS],
      ["DIRECT_EXECUTION_GUARDRAILS", DIRECT_EXECUTION_GUARDRAILS],
    ] as const) {
      expect(
        violates(guardrails),
        `${name} contains a tools.execute() sample without version configuration`,
      ).toBe(false);
    }
  });
});
