import { afterEach, expect, mock, test } from 'bun:test';
import { getToolkitBySlug } from '../../lib/toolkit-data';
import { fetchDetailedTools } from '../../lib/toolkit-tools';

const originalFetch = globalThis.fetch;
const originalKey = process.env.COMPOSIO_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.COMPOSIO_API_KEY;
  else process.env.COMPOSIO_API_KEY = originalKey;
});

test('an older detail response cannot shrink the refreshed Tableau catalog', async () => {
  const tableau = (await getToolkitBySlug('tableau'))!;
  // Simulate the ten-item detail response observed on production.
  const oldTools = tableau.tools.slice(0, 10);
  process.env.COMPOSIO_API_KEY = 'test-key';
  const fetchMock = mock(async (_input: RequestInfo | URL) => Response.json({ items: oldTools }));
  globalThis.fetch = fetchMock;

  const tools = await fetchDetailedTools(tableau);
  expect(tools.length).toBe(tableau.toolCount);
  expect(tools.map(tool => tool.slug)).toEqual(tableau.tools.map(tool => tool.slug));
  const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
  expect(url.searchParams.get('toolkit_versions[tableau]')).toBe('latest');
});

test('enriches matching tools without importing another incomplete inventory', async () => {
  const tableau = (await getToolkitBySlug('tableau'))!;
  process.env.COMPOSIO_API_KEY = 'test-key';
  globalThis.fetch = mock(async () => Response.json({ items: [
    { ...tableau.tools[0], input_parameters: { properties: { id: { type: 'string' } } } },
    { slug: 'TABLEAU_UNPUBLISHED', name: 'Unpublished', description: '' },
  ] }));

  const tools = await fetchDetailedTools(tableau);
  expect(tools[0].input_parameters?.id.type).toBe('string');
  expect(tools.map(tool => tool.slug)).toEqual(tableau.tools.map(tool => tool.slug));
});

test('accepts a complete newer inventory when the snapshot lags a release', async () => {
  const tableau = (await getToolkitBySlug('tableau'))!;
  process.env.COMPOSIO_API_KEY = 'test-key';
  const newTool = { slug: 'TABLEAU_NEW_RELEASE', name: 'New release', description: '' };
  globalThis.fetch = mock(async () => Response.json({ items: [...tableau.tools, newTool] }));
  const tools = await fetchDetailedTools(tableau);
  expect(tools).toHaveLength(tableau.tools.length + 1);
  expect(tools.at(-1)?.slug).toBe(newTool.slug);
});

test('retains the snapshot on a failed fetch and supports toolkits missing from it', async () => {
  const tableau = (await getToolkitBySlug('tableau'))!;
  process.env.COMPOSIO_API_KEY = 'test-key';
  globalThis.fetch = mock(async () => new Response(null, { status: 429 }));
  expect(await fetchDetailedTools(tableau)).toEqual(tableau.tools);

  globalThis.fetch = mock(async () => Response.json({ items: tableau.tools.slice(0, 1) }));
  expect(await fetchDetailedTools({ ...tableau, tools: [], version: null })).toHaveLength(1);
});
