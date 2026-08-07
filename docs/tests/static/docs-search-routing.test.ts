import { describe, expect, test } from 'bun:test';

import { canonicalRouteForQuery, promoteCanonicalRoute } from '../../agent/lib/docs-routing';

describe('docs search canonical routing', () => {
  test('routes an existing explicit MCP client to Composio Connect', () => {
    const query =
      'I already have an MCP client and explicitly want a Composio MCP URL, not an SDK session.';

    expect(canonicalRouteForQuery(query)).toBe('/docs/composio-connect');
    expect(
      promoteCanonicalRoute(
        ['/docs/sessions-via-mcp', '/docs/composio-connect', '/docs/agent-plugins'],
        canonicalRouteForQuery(query),
        route => route
      )
    ).toEqual(['/docs/composio-connect', '/docs/sessions-via-mcp', '/docs/agent-plugins']);
  });

  test('routes the exact legacy execute API without weakening the general legacy penalty', () => {
    const exactLegacyQuery =
      'I am maintaining code that explicitly calls composio.tools.execute(). Show the implementation.';

    expect(canonicalRouteForQuery(exactLegacyQuery)).toBe(
      '/docs/tools-direct/executing-tools'
    );
    expect(canonicalRouteForQuery('How do I execute tools in a new Composio application?')).toBe(
      undefined
    );
  });
});
