/** Shared version guidance for agent-facing markdown. */

import {
  API_BASE_URLS,
  detectApiVersion,
  isReferenceUrl,
  toCurrentVersionUrl,
} from './api-version';

/** Baseline guidance for all REST operations. */
export const REST_VERSION_GUIDANCE = `## REST API version

The current REST API version is **v3.1**, served at \`${API_BASE_URLS['3.1']}\`. Prefer it for new code and new examples.

\`${API_BASE_URLS['3.0']}\` is the previous version. It is frozen with pinned tool-version defaults and remains supported — existing v3 integrations keep working and do not need to migrate.`;

/** Version-stripped tool paths whose defaults need explicit guidance. */
export const TOOL_VERSION_PATHS = [
  '/tools',
  '/tools/{tool_slug}',
  '/tools/execute/{tool_slug}',
  '/tools/execute/{tool_slug}/input',
  '/tools/scopes/required',
] as const;

/** Guidance for the tool-endpoint defaults that differ across REST versions. */
export const TOOL_VERSION_GUIDANCE = `## Tool-endpoint version defaults on v3.1

On v3.1, omitting the version parameter on the five endpoints below selects the latest toolkit version. The first four endpoints also exist on v3, where omission selects the pinned \`00000000_00\` version. \`POST /tools/scopes/required\` is v3.1-only.

| Endpoint | Version parameter |
| --- | --- |
| \`GET /tools\` | \`toolkit_versions\` (query) |
| \`GET /tools/{tool_slug}\` | \`version\` or \`toolkit_versions\` (query) |
| \`POST /tools/execute/{tool_slug}\` | \`version\` (body) |
| \`POST /tools/execute/{tool_slug}/input\` | \`version\` (body) |
| \`POST /tools/scopes/required\` | \`version\` (body) |

A v3.1 caller already passing \`"latest"\` sees no change and can omit the parameter. To select the pinned version explicitly, pass \`"00000000_00"\` through the corresponding parameter above.

This version-default change is limited to the five endpoints above.`;

const TOOL_VERSION_PATH_SET: ReadonlySet<string> = new Set(TOOL_VERSION_PATHS);

/** Longest prefix first to avoid matching `/api/v3` inside `/api/v3.1`. */
const VERSION_PREFIXES = ['/api/v3.1', '/api/v3'] as const;

/**
 * Replaces stale OpenAPI default prose with the deployed REST-version default.
 * The source specs are generated upstream, so the agent-facing renderer fixes
 * their description without mutating the generated snapshots.
 */
export function toolVersionParameterDescription(
  rawSpecPath: string,
  description = 'Tool version to use'
): string {
  if (!isToolVersionPath(rawSpecPath)) return description;

  const apiVersion = rawSpecPath.startsWith('/api/v3.1') ? '3.1' : '3.0';
  const defaultVersion = apiVersion === '3.1' ? 'latest' : '00000000_00';
  const withoutDefault = description.replace(/\s*\(?defaults?\s+to\b[\s\S]*$/i, '').trim();
  const base = (withoutDefault || 'Tool version to use').replace(/[.:]\s*$/, '');

  return `${base}. Defaults to \`${defaultVersion}\` when omitted on REST API v${apiVersion}.`;
}

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
    const currentUrl = `${toCurrentVersionUrl(pageUrl)}.md`;
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
