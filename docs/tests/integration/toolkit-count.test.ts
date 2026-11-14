import { expect, test } from 'bun:test';
import { TOOLKIT_COUNT_LABEL } from '../../lib/toolkit-count';
import { fetchPage } from './helpers';

test('catalog claims resolve in rendered pages, metadata, and Markdown exports', async () => {
  for (const path of [
    '/docs/quickstart',
    '/docs/providers/openai',
    '/reference',
    '/toolkits/meta-tools',
    '/toolkits/meta-tools/search_tools',
    '/docs/quickstart.md',
    '/reference.md',
    '/llms.txt',
  ]) {
    const response = await fetchPage(path);
    expect(response.status, path).toBe(200);
    const text = await response.text();
    // Ignore metadata and hydration payloads so a sitewide count cannot mask a stale body.
    const body = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]*>/g, '');
    if (path !== '/docs/providers/openai') {
      expect(body, path).toContain(`${TOOLKIT_COUNT_LABEL} toolkits`);
    }
    expect(text, path).not.toContain('%TOOLKIT_COUNT%');
    if (path === '/docs/providers/openai') {
      expect(text).toContain(`name="description" content="Build an agent with OpenAI and enable it to use ${TOOLKIT_COUNT_LABEL} toolkits with Composio.`);
    }
  }
});
