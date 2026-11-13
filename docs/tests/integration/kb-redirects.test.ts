import { describe, expect, test } from 'bun:test';
import { fetchNoRedirect } from './helpers';

// The Knowledge Base was retired. Its URLs keep resolving through permanent
// redirects defined in lib/kb-redirects.mjs.
describe('retired Knowledge Base redirects', () => {
  for (const [from, to] of [
    ['/kb', '/docs'],
    ['/kb.md', '/docs.md'],
    ['/kb/search?q=oauth', '/docs'],
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
});
