/**
 * Session tool-execution policy for docs samples.
 *
 * Provider helpers must receive the Tool Router session that produced the
 * model-visible tools. Passing a user ID chooses direct execution instead,
 * so session meta-tools fail at runtime.
 *
 * A 102-run agent eval of the docs (August 2026, two-phase build+probe)
 * found 58/102 runs hit that rejection by copying provider-page samples
 * that paired `session.tools()` with `handle_tool_calls`. All recovering
 * runs converged on `session.execute()`, discovered from SDK source. The SDK
 * helpers now accept the session directly and retain provider normalization.
 *
 * Rule: no authored MDX page may pair session tools (`session.tools()` /
 * `sessions.create` / `composio.create(`) with a provider helper explicitly
 * bound to a user ID. Session-bound helper calls and direct-path (`tools.get`)
 * samples are valid.
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
const DIRECT_HELPER_TOKEN_RE =
  /(?:handle_tool_calls|execute_tool_call)\s*\([\s\S]*?\buser_id\s*=|(?:handleToolCalls|executeToolCall)\s*\(\s*["'`]/;

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
  test("session samples do not bind provider helpers to a user ID", async () => {
    const offenders: string[] = [];

    for (const dir of CONTENT_DIRS) {
      for (const file of await findMdxFiles(dir)) {
        const rel = relative(CONTENT_ROOT, file);
        if (EXCLUDED_PATH_SEGMENTS.some((seg) => rel.includes(seg))) continue;

        const fences = codeFences(await readFile(file, "utf8"));
        const offending = fences.some(
          (f) => SESSION_TOKEN_RE.test(f) && DIRECT_HELPER_TOKEN_RE.test(f),
        );
        if (offending) {
          offenders.push(rel);
        }
      }
    }

    expect(
      offenders,
      `These pages bind session tools to a direct user-ID execution target. ` +
        `Pass the session to the provider helper instead:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });
});
