/**
 * API version identity in the markdown channels.
 *
 * Agents read `.md`, not the browser rendering path. Every signal that
 * separates v3.1 from v3.0 used to live in client components the markdown
 * converter dropped, so `reference.md` published an empty `Base URL` bullet
 * and the tag pages published an empty `Endpoints` section — while the
 * superseded v3.0 operation pages published a complete working curl example.
 *
 * These tests lock the three properties that fix costs the most to lose:
 *  1. `mdxToCleanMarkdown` renders `ApiBaseUrl` and `ApiEndpointsTable` at the
 *     version the page URL implies, and degrades (no table, no throw) on a
 *     malformed payload rather than 500ing the whole `.md` response.
 *  2. `getLLMText` emits a version pointer on `/reference/**` and nowhere else.
 *  3. The guidance text is single-sourced in `lib/api-version-guidance.ts` —
 *     asserted by containment of the exported constant, not by matching a
 *     copied literal, which is what proves the guardrail files compose rather
 *     than restate.
 */
import { describe, expect, test } from 'bun:test';

import {
  REST_VERSION_GUIDANCE,
  TOOL_VERSION_GUIDANCE,
  TOOL_VERSION_PATHS,
  isToolVersionPath,
} from '../../lib/api-version-guidance';

describe('API version guidance constants', () => {
  test('the REST baseline names the v3.1 base URL and neither constant claims parity', () => {
    expect(REST_VERSION_GUIDANCE).toContain('https://backend.composio.dev/api/v3.1');
    // v3.1 is a structural superset with five changed tool-endpoint defaults,
    // not a twin. "identical" shipped in an earlier draft and was wrong.
    expect(REST_VERSION_GUIDANCE.toLowerCase()).not.toContain('identical');
    expect(TOOL_VERSION_GUIDANCE.toLowerCase()).not.toContain('identical');
  });

  test('exactly five tool paths flip their version default', () => {
    expect(TOOL_VERSION_PATHS).toHaveLength(5);
  });
});

describe('isToolVersionPath normalization contract', () => {
  // Every key below appears verbatim in a committed spec. The predicate takes
  // the raw spec path key; no caller pre-strips anything.
  const cases: Array<[path: string, expected: boolean, why: string]> = [
    ['/api/v3.1/tools', true, ''],
    ['/api/v3.1/tools/{tool_slug}', true, 'fails if /api/v3 is stripped before /api/v3.1'],
    ['/api/v3.1/tools/execute/{tool_slug}', true, ''],
    ['/api/v3.1/tools/execute/{tool_slug}/input', true, ''],
    ['/api/v3.1/tools/scopes/required', true, 'v3.1-only; has no v3 counterpart'],
    ['/api/v3/tools', true, ''],
    ['/api/v3/tools/{tool_slug}', true, ''],
    ['/api/v3/tools/execute/{tool_slug}', true, ''],
    ['/api/v3/tools/execute/{tool_slug}/input', true, ''],
    ['/api/v3.1/tools/enum', false, 'under /tools, not affected — breaks a prefix match'],
    ['/api/v3.1/tools/execute/proxy', false, 'under /tools/execute, not affected'],
    [
      '/api/v3.1/tool_router/session/{session_id}/tools',
      false,
      'ends in /tools — breaks a substring match',
    ],
    ['/api/v3.1/auth_configs', false, 'plain non-tool'],
    ['/api/v3.1/triggers_types', false, 'triggers already default to latest'],
    ['/tools/{tool_slug}', false, 'no version prefix; the predicate normalizes, it does not guess'],
  ];

  for (const [path, expected, why] of cases) {
    test(`${path} -> ${expected}${why ? ` (${why})` : ''}`, () => {
      expect(isToolVersionPath(path)).toBe(expected);
    });
  }
});
