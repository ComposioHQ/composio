import { expect, test } from 'bun:test';
import { TOOLKIT_COUNT_LABEL } from '../../lib/toolkit-count';
import { fetchPage } from './helpers';

test('catalog claims use apps in marketing copy and toolkits in technical docs', async () => {
  for (const [path, noun] of [
    ['/docs', 'apps'],
    ['/docs/quickstart', 'apps'],
    ['/docs/providers/openai', 'apps'],
    ['/docs/claude-code-plugin', 'apps'],
    ['/reference', 'toolkits'],
    ['/toolkits/meta-tools', 'toolkits'],
    ['/toolkits/meta-tools/search_tools', 'toolkits'],
    ['/docs/quickstart.md', 'apps'],
    ['/reference.md', 'toolkits'],
    ['/llms.txt', 'apps'],
  ]) {
    const response = await fetchPage(path);
    expect(response.status, path).toBe(200);
    const text = await response.text();
    // Ignore metadata and hydration payloads so a sitewide count cannot mask a stale body.
    const body = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]*>/g, '');
    if (path !== '/docs/providers/openai') {
      expect(body, path).toContain(`${TOOLKIT_COUNT_LABEL} ${noun}`);
    }
    expect(text, path).not.toContain('%TOOLKIT_COUNT%');
    if (path === '/docs/providers/openai') {
      expect(text).toContain(`name="description" content="Build an agent with OpenAI and enable it to use ${TOOLKIT_COUNT_LABEL} apps with Composio.`);
    }
  }
});
