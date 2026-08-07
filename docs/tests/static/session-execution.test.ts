/**
 * Session tool-execution policy for docs samples.
 *
 * Session tools must be executed with `session.execute()` — the provider
 * helpers (`handle_tool_calls` / `handleToolCalls`) use the direct execution
 * path, which does not carry the session, so session meta-tools fail at
 * runtime with: '... can only be called inside a tool-router session'.
 *
 * A 102-run agent eval of the docs (August 2026, two-phase build+probe)
 * found 58/102 runs hit that rejection by copying provider-page samples
 * that paired `session.tools()` with `handle_tool_calls`. All recovering
 * runs converged on `session.execute()`, discovered from SDK source
 * because no docs page documented it.
 *
 * Rule: no authored MDX page may pair session tools (`session.tools()` /
 * `sessions.create` / `composio.create(`) with a provider tool-call helper
 * (`handle_tool_calls` / `handleToolCalls`) in its code fences. Pages
 * showing the helper for the direct path (`tools.get`) are fine.
 *
 * Scope: content/docs and content/examples. Excluded: content/reference
 * (generated upstream), changelog (historical), docs/migration-guide
 * (point-in-time documents that may show old APIs).
 */
import { describe, test, expect } from "bun:test";
import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";

const CONTENT_DIRS = ["docs", "examples"].map((dir) =>
  join(import.meta.dir, "../../content", dir),
);
const CONTENT_ROOT = join(import.meta.dir, "../../content");
const EXCLUDED_PATH_SEGMENTS = ["docs/migration-guide/"];

const SESSION_TOKEN_RE =
  /session\.tools\s*\(|sessions\.create\s*\(|composio\.create\s*\(/;
const HELPER_TOKEN_RE =
  /handle_tool_calls|handleToolCalls|execute_tool_call|executeToolCall/;

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

function codeFences(source: string): string[] {
  return source.match(/```[\s\S]*?```/g) ?? [];
}

describe("session execution samples", () => {
  test("no page pairs session tools with a provider tool-call helper", async () => {
    const offenders: string[] = [];

    for (const dir of CONTENT_DIRS) {
      for (const file of await findMdxFiles(dir)) {
        const rel = relative(CONTENT_ROOT, file);
        if (EXCLUDED_PATH_SEGMENTS.some((seg) => rel.includes(seg))) continue;

        const fences = codeFences(await readFile(file, "utf8"));
        const offending = fences.some(
          (f) => SESSION_TOKEN_RE.test(f) && HELPER_TOKEN_RE.test(f),
        );
        if (offending) {
          offenders.push(rel);
        }
      }
    }

    expect(
      offenders,
      `These pages pair session tools with handle_tool_calls/handleToolCalls, ` +
        `which fails at runtime for session meta-tools. Use session.execute() ` +
        `in session samples instead:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });
});
