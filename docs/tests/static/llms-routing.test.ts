import { afterEach, expect, test } from 'bun:test';
import { GET } from '../../app/llms.txt/route';
import { source, referenceSource, examplesSource, knowledgeBaseSource } from '../../lib/source';

const originalMcpUrl = process.env.DOCS_SEARCH_MCP_URL;
afterEach(() => {
  if (originalMcpUrl === undefined) delete process.env.DOCS_SEARCH_MCP_URL;
  else process.env.DOCS_SEARCH_MCP_URL = originalMcpUrl;
});

test('docs search discovery is opt-in and uses the deployment endpoint', async () => {
  delete process.env.DOCS_SEARCH_MCP_URL;
  expect(await GET().text()).not.toContain('Documentation search MCP');
  process.env.DOCS_SEARCH_MCP_URL = 'https://docs-search.example.com/mcp';
  const text = await GET().text();
  expect(text).toContain('[Documentation search MCP](https://docs-search.example.com/mcp)');
  expect(text).toContain('read-only `search` tool');
  expect(text.length).toBeLessThan(6500);
  process.env.DOCS_SEARCH_MCP_URL = 'http://docs-search.example.com/mcp';
  expect(() => GET()).toThrow();
});

test('routing map is bounded and covers the current developer decisions', async () => {
  const text = await GET().text();
  expect(text.length).toBeLessThan(6500);
  const primary = text.split('## Optional')[0];
  for (const path of ['docs', 'docs/agent-setup', 'docs/quickstart', 'docs/agent-plugins',
    'docs/authentication', 'docs/configuring-sessions', 'kb']) {
    expect(primary).toContain(`https://docs.composio.dev/${path}.md`);
  }
  expect(text).toContain('[Complete documentation index](https://docs.composio.dev/llms-index.txt)');
  expect(text).not.toMatch(/^- https?:/m);
  expect(text).toContain('REST v3.0 is legacy');
  const pages = new Set([source, referenceSource, examplesSource, knowledgeBaseSource]
    .flatMap(collection => collection.getPages().map(page => page.url)));
  pages.add('/docs/changelog');
  for (const match of text.matchAll(/\]\(https:\/\/docs\.composio\.dev([^)]*)\.md\)/g)) {
    expect(pages.has(match[1]), `unresolved route: ${match[1]}`).toBe(true);
  }
});
