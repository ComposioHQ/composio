import { describe, expect, test } from 'bun:test';
import { fetchNoRedirect } from './helpers';

// The Knowledge Base was retired. Its URLs keep resolving through permanent
// redirects defined in lib/kb-redirects.mjs.
describe('retired Knowledge Base redirects', () => {
  for (const [from, to] of [
    ['/kb', '/docs'],
    ['/kb.md', '/docs.md'],
    ['/kb/search', '/docs'],
    ['/kb/search.md', '/docs.md'],
    ['/kb/composio-for-you/an-old-alias.md', '/docs.md'],
    ['/llms.mdx/kb', '/docs.md'],
    ['/llms.mdx/kb/guide/toolkits-gmail', '/kb/guide/toolkits-gmail.md'],
    ['/kb/toolkits', '/toolkits'],
    ['/kb/toolkit/gmail', '/toolkits/gmail'],
    ['/kb/topic/sdk-api-and-mcp', '/reference'],
    ['/kb/guide/toolkits-gmail', '/toolkits/gmail'],
    ['/kb/guide/toolkits-gmail.md', '/toolkits/gmail.md'],
    ['/kb/guide/toolkits-google-calendar', '/toolkits/googlecalendar'],
    ['/kb/guide/consumer-project-boundaries-and-auth-selection', '/docs/consumer-agents'],
    ['/kb/guide/platform-rate-limits', '/reference/rate-limits'],
    ['/kb/composio-for-you/an-old-alias', '/docs'],
  ] as const) {
    test(`${from} redirects to ${to}`, async () => {
      const response = await fetchNoRedirect(from);
      expect(response.status).toBe(308);
      expect(new URL(response.headers.get('location')!, response.url).pathname).toBe(to);
    });
  }

  test('a saved /kb/search link drops its search text', async () => {
    const response = await fetchNoRedirect('/kb/search?q=token%3Dsecret&filter=docs');
    expect(response.status).toBe(308);
    const location = new URL(response.headers.get('location')!, response.url);
    expect(location.pathname).toBe('/docs');
    expect(location.searchParams.get('q')).toBe('');
  });
});
