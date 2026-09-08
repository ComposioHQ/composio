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

const SESSION_TOKEN_RE =
  /session\.tools\s*\(|sessions\.create\s*\(|composio\.create\s*\(/;
// Python branch: user_id= must appear inside the helper's argument list —
// the bound tolerates one level of nested calls (`response=build_response()`)
// but never runs past the helper's closing paren into later code. TS branch:
// a string-literal first argument, or a whole identifier that names a user ID
// (`userId`, `user_id`, `uid`) — a session argument never does.
const DIRECT_HELPER_TOKEN_RE =
  /(?:handle_tool_calls|execute_tool_call)\s*\((?:[^()]*\([^()]*\))*[^()]*\buser_id\s*=|(?:handleToolCalls|executeToolCall)\s*\(\s*(?:["'`]|(?:user_?[iI]d|uid)\b)/;
const SAMPLE_BOUNDARY_RE = /^\s*(?:<\/?(?:Tab|Step)\b|#{1,6}\s)/;
const FENCE_OPEN_RE = /^\s*(`{3,}|~{3,})/;
const FENCE_CLOSE_RE = /^\s*(`{3,}|~{3,})\s*$/;

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

function codeSampleGroups(source: string): string[] {
  const groups: string[] = [];
  let current: string[] = [];
  let fenceMarker: string | undefined;

  const flush = () => {
    if (current.length > 0) groups.push(current.join("\n"));
    current = [];
  };

  for (const line of source.split(/\r?\n/)) {
    if (fenceMarker === undefined && SAMPLE_BOUNDARY_RE.test(line)) flush();

    if (fenceMarker === undefined) {
      const opening = line.match(FENCE_OPEN_RE)?.[1];
      if (opening !== undefined) {
        fenceMarker = opening;
        current.push(line);
      }
      continue;
    }

    current.push(line);
    const closing = line.match(FENCE_CLOSE_RE)?.[1];
    if (
      closing !== undefined &&
      closing[0] === fenceMarker[0] &&
      closing.length >= fenceMarker.length
    ) {
      fenceMarker = undefined;
    }
  }

  flush();
  return groups;
}

function hasDirectHelperBoundToSessionTools(source: string): boolean {
  return codeSampleGroups(source).some(
    (sample) => SESSION_TOKEN_RE.test(sample) && DIRECT_HELPER_TOKEN_RE.test(sample),
  );
}

describe("session execution samples", () => {
  test("detects a direct helper split from session setup within one sample", () => {
    const source = `
<Tab value="Python">
~~~python
session = composio.create(user_id="user_123")
tools = session.tools()
~~~

Run the model, then execute its calls:

~~~python
results = composio.provider.handle_tool_calls(
    response=response,
    user_id="user_123",
)
~~~
</Tab>`;

    expect(hasDirectHelperBoundToSessionTools(source)).toBe(true);
  });

  test("allows session targets and keeps separate tab samples independent", () => {
    const sessionTarget = `
<Tab value="Python">
\`\`\`python
session = composio.create(user_id="user_123")
tools = session.tools()
\`\`\`
\`\`\`python
results = composio.provider.handle_tool_calls(response=response, session=session)
\`\`\`
</Tab>`;
    const separateTargets = `
<Tab value="Session">
\`\`\`typescript
const tools = await session.tools();
\`\`\`
</Tab>
<Tab value="Direct">
\`\`\`typescript
const results = await composio.provider.handleToolCalls("user_123", response);
\`\`\`
</Tab>`;

    expect(hasDirectHelperBoundToSessionTools(sessionTarget)).toBe(false);
    expect(hasDirectHelperBoundToSessionTools(separateTargets)).toBe(false);
  });

  test("session-bound helper is not flagged by a later unrelated user_id", () => {
    const source = `
<Tab value="Python">
\`\`\`python
session = composio.create(user_id="user_123")
tools = session.tools()
results = composio.provider.handle_tool_calls(response=response, session=session)
\`\`\`
\`\`\`python
other_session = composio.create(user_id="user_456")
\`\`\`
</Tab>`;

    expect(hasDirectHelperBoundToSessionTools(source)).toBe(false);
  });

  test("detects a user_id hidden behind a nested call in the same argument list", () => {
    const source = `
<Tab value="Python">
\`\`\`python
session = composio.create(user_id="user_123")
tools = session.tools()
results = composio.provider.handle_tool_calls(response=build_response(), user_id="user_123")
\`\`\`
</Tab>`;

    expect(hasDirectHelperBoundToSessionTools(source)).toBe(true);
  });

  test("session variables that merely start with 'user' are not flagged", () => {
    const source = `
<Tab value="TypeScript">
\`\`\`typescript
const userSession = await composio.create("user_123");
const tools = await userSession.tools();
const results = await composio.provider.handleToolCalls(userSession, response);
\`\`\`
</Tab>`;

    expect(hasDirectHelperBoundToSessionTools(source)).toBe(false);
  });

  test("detects a TypeScript helper bound to a user-ID variable", () => {
    const source = `
<Tab value="TypeScript">
\`\`\`typescript
const userId = "user_123";
const session = await composio.create(userId);
const tools = await session.tools();
const results = await composio.provider.handleToolCalls(userId, response);
\`\`\`
</Tab>`;

    expect(hasDirectHelperBoundToSessionTools(source)).toBe(true);
  });

  test("LLM guardrail blocks never bind provider helpers to a user ID", () => {
    for (const guardrails of [SESSION_GUARDRAILS, DIRECT_EXECUTION_GUARDRAILS]) {
      expect(hasDirectHelperBoundToSessionTools(guardrails)).toBe(false);
    }
  });

  test("session samples do not bind provider helpers to a user ID", async () => {
    const offenders: string[] = [];

    for (const dir of CONTENT_DIRS) {
      for (const file of await findMdxFiles(dir)) {
        const rel = relative(CONTENT_ROOT, file);
        if (EXCLUDED_PATH_SEGMENTS.some((seg) => rel.includes(seg))) continue;

        const source = await readFile(file, "utf8");
        if (hasDirectHelperBoundToSessionTools(source)) {
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
