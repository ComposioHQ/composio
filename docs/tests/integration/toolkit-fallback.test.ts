import { describe, expect, test } from 'bun:test';
import { fetchPage } from './helpers';

const LIVE_ONLY_TOOLKIT_SLUG = '7shifts';

describe('toolkit snapshot fallback', () => {
  test('renders a toolkit from the committed snapshot', async () => {
    const response = await fetchPage('/toolkits/github');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html.toLowerCase()).toContain('github');
  });

  test('returns 404 for a nonsense toolkit slug', async () => {
    const response = await fetchPage('/toolkits/__definitely-not-a-toolkit__');

    expect(response.status).toBe(404);
  });

  if (process.env.COMPOSIO_API_KEY) {
    test('renders fallback content and metadata for a production-only toolkit', async () => {
      const response = await fetchPage(`/toolkits/${LIVE_ONLY_TOOLKIT_SLUG}`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html.toLowerCase()).toContain('7shifts');
      expect(html).toMatch(/<title>[^<]*7shifts[^<]*Composio Toolkit[^<]*<\/title>/i);
      expect(html).toContain(`<link rel="canonical" href="/toolkits/${LIVE_ONLY_TOOLKIT_SLUG}"`);
      expect(html).not.toContain('<title>Toolkit Not Found');
    });
  } else {
    test.skip('production-only fallback requires COMPOSIO_API_KEY', () => {});
  }
});
