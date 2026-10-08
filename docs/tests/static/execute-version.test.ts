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
 * Additionally: `"latest"` as a toolkit_versions value is rejected by the
 * SDK for manual execution (runtime-verified 2026-08-03: ToolVersionRequiredError,
 * '"latest" is not supported in manual execution') unless the execute call
 * passes `dangerously_skip_version_check` / `dangerouslySkipVersionCheck`.
 * Pages showing "latest" alongside execute samples must also show the flag.
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
const LATEST_VALUE_RE = /toolkit_?[vV]ersions[^}\n]{0,120}["']latest["']/;
const SKIP_FLAG_RE = /dangerously_skip_version_check|dangerouslySkipVersionCheck/;

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

function violates(content: string): string | null {
  const code = fencedCode(content);
  if (!EXECUTE_CALL_RE.test(code)) return null;
  if (!VERSION_TOKEN_RE.test(code)) return "no version configuration";
  if (LATEST_VALUE_RE.test(code) && !SKIP_FLAG_RE.test(code)) {
    return '"latest" without dangerously_skip_version_check (rejected at runtime for manual execution)';
  }
  return null;
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
      const problem = violates(content);
      if (problem) {
        failures.push(`${relPath} — ${problem}`);
      }
    }

    expect(
      failures,
      `Pages with broken tools.execute() version handling ` +
        `(see /docs/tools-direct/toolkit-versioning):\n` +
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
        `${name} has broken tools.execute() version handling: ${violates(guardrails)}`,
      ).toBeNull();
    }
  });
});
