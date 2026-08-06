/**
 * REST API version guidance for the agent-facing markdown channels.
 *
 * Two separate facts, kept separate because they have different audiences:
 *
 *  - `REST_VERSION_GUIDANCE` — which version is current and where it lives.
 *    Applies to everything.
 *  - `TOOL_VERSION_GUIDANCE` — the one behavioral difference between the two
 *    prefixes: five tool endpoints flip their version-parameter default.
 *    Applies to broad channels, and to exactly those five operation pages.
 *
 * Every channel composes from these constants; no channel restates them.
 * Duplicating the literals across `llm-guardrails/session.ts`,
 * `llm-guardrails/direct-execution.ts`, and `openapiPageToMarkdown` is how
 * they drift. `tests/static/api-version-markdown.test.ts` asserts containment
 * of the exported constant rather than a copied literal, so composition is
 * what the suite actually proves.
 *
 * Composition rule:
 *  - Broad channels (both guardrail sets) get REST + TOOL.
 *  - OpenAPI operation pages get REST always, TOOL only when
 *    `isToolVersionPath` matches the raw spec path key.
 *  - Top notes carry neither — the guardrail block on the same page already
 *    does, and repeating it puts the same paragraph twice in one response.
 *
 * v3 is superseded, not deprecated: it is intentionally frozen with pinned
 * tool-version defaults and existing integrations keep working. Never write
 * "identical" (or "identical contracts" / "identical twin") in these strings —
 * v3.1 is a structural superset with five changed defaults, not a twin.
 */

import {
  API_BASE_URLS,
  detectApiVersion,
  isReferenceUrl,
  toCurrentVersionUrl,
} from './api-version';

/** Baseline: which REST version is current, and what `/api/v3` still is. */
export const REST_VERSION_GUIDANCE = `

## REST API version

The current REST API version is **v3.1**, served at \`${API_BASE_URLS['3.1']}\`. Prefer it for new code and new examples.

\`${API_BASE_URLS['3.0']}\` is the previous version. It is frozen with pinned tool-version defaults and remains supported — existing v3 integrations keep working and do not need to migrate.
`;

/**
 * The five path keys, version prefix stripped, whose version-parameter default
 * changes between the two prefixes. Order matches the table in
 * `TOOL_VERSION_GUIDANCE`.
 */
export const TOOL_VERSION_PATHS = [
  '/tools',
  '/tools/{tool_slug}',
  '/tools/execute/{tool_slug}',
  '/tools/execute/{tool_slug}/input',
  '/tools/scopes/required',
] as const;

/** The one behavioral difference between `/api/v3` and `/api/v3.1`. */
export const TOOL_VERSION_GUIDANCE = `

## Tool-endpoint version defaults on v3.1

On v3.1 the five tool endpoints below default their version parameter to the latest toolkit version instead of the pinned \`00000000_00\`:

| Endpoint | Version parameter |
| --- | --- |
| \`GET /tools\` | \`toolkit_versions\` (query) |
| \`GET /tools/{tool_slug}\` | \`version\` (query) |
| \`POST /tools/execute/{tool_slug}\` | \`version\` (body) |
| \`POST /tools/execute/{tool_slug}/input\` | \`version\` (body) |
| \`POST /tools/scopes/required\` | \`version\` (body) |

A caller already passing \`version: "latest"\` or \`toolkit_versions: "latest"\` sees no change and can drop the parameter. A caller that wants the v3 pinned default must pass it explicitly — \`version=00000000_00\`, or \`toolkit_versions=00000000_00\` on \`GET /tools\`.

Triggers and every non-tool endpoint are unchanged between the two prefixes.
`;

const TOOL_VERSION_PATH_SET: ReadonlySet<string> = new Set(TOOL_VERSION_PATHS);

/**
 * Version prefixes as the committed specs key them — with the `/api` segment.
 * `/api/v3.1` must be tried first: `/api/v3` also matches the head of
 * `/api/v3.1/tools` and would leave `.1/tools`, which matches nothing and
 * silently returns false for every v3.1 tool page.
 */
const VERSION_PREFIXES = ['/api/v3.1', '/api/v3'] as const;

/**
 * True when a raw OpenAPI spec path key is one of the five endpoints whose
 * version-parameter default changes on v3.1.
 *
 * Normalization is this function's job, and only its job — callers pass the
 * spec path key verbatim (`/api/v3.1/tools/{tool_slug}`) and pre-strip
 * nothing. The remainder is compared by exact set membership, never by prefix
 * or substring: `/api/v3.1/tools/enum`, `/api/v3.1/tools/execute/proxy`, and
 * `/api/v3.1/tool_router/session/{session_id}/tools` all mention `tools`, none
 * of them is affected, and a looser test would attach the tool-version
 * guidance to all three.
 */
/**
 * The short version pointer for a reference page: which version this page
 * documents, its base URL, and — on a legacy page — the link to the same page
 * on v3.1. Empty outside the reference tree.
 *
 * A pointer, not guidance: the guardrail block (MDX pages) or
 * `REST_VERSION_GUIDANCE` (operation pages) already carries the explanation
 * further down the same response, and repeating it would put the same
 * paragraph twice. Both renderers call this so their pointers agree by
 * construction.
 */
export function apiVersionPointer(pageUrl: string): string {
  if (!isReferenceUrl(pageUrl)) return '';

  if (detectApiVersion(pageUrl) === '3.0') {
    const currentUrl = `https://docs.composio.dev${toCurrentVersionUrl(pageUrl)}.md`;
    return `\n> **API version:** This page documents Composio REST API v3.0 at \`${API_BASE_URLS['3.0']}\`, the previous version. v3.1 is current, at \`${API_BASE_URLS['3.1']}\` — the same page on v3.1 is ${currentUrl}.\n`;
  }

  return `\n> **API version:** This page documents Composio REST API v3.1, the current version, at \`${API_BASE_URLS['3.1']}\`. \`${API_BASE_URLS['3.0']}\` is the previous version and remains supported.\n`;
}

export function isToolVersionPath(rawSpecPath: string): boolean {
  for (const prefix of VERSION_PREFIXES) {
    if (rawSpecPath.startsWith(prefix)) {
      return TOOL_VERSION_PATH_SET.has(rawSpecPath.slice(prefix.length));
    }
  }
  return false;
}
