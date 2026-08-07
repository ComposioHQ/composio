import { describe, expect, test } from 'bun:test';

import { canonicalRouteForQuery, searchDocs } from '../../agent/lib/docs-search';

function topRoute(query: string): string | undefined {
  return searchDocs(query, { limit: 3, hydrateContent: false }).results[0]?.url;
}

describe('docs search canonical routing', () => {
  test('routes an existing explicit MCP client to Composio Connect', () => {
    const query =
      'I already have an MCP client and explicitly want a Composio MCP URL, not an SDK session.';

    expect(canonicalRouteForQuery(query)).toBe('/docs/composio-connect');
    expect(topRoute(query)).toBe('/docs/composio-connect');
  });

  test('routes the exact legacy execute API without weakening the general legacy penalty', () => {
    const exactLegacyQuery =
      'I am maintaining code that explicitly calls composio.tools.execute(). Show the implementation.';

    expect(canonicalRouteForQuery(exactLegacyQuery)).toBe(
      '/docs/tools-direct/executing-tools'
    );
    expect(topRoute(exactLegacyQuery)).toBe('/docs/tools-direct/executing-tools');
    expect(canonicalRouteForQuery('How do I execute tools in a new Composio application?')).toBe(
      undefined
    );
  });
});
