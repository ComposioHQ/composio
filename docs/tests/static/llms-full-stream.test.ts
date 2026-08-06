/**
 * `/llms-full.txt` streams its body instead of building one giant string.
 *
 * The endpoint is consumed by external agents, so the bytes must not move: these
 * tests rebuild the response with the original algorithm (render every page into
 * an array, then `array.join('\n\n---\n\n')`) and assert the streamed body is
 * identical to it.
 */
import { beforeAll, describe, expect, mock, test } from 'bun:test';

import { SESSION_GUARDRAILS } from '../../lib/llm-guardrails';

interface FakePage {
  url: string;
  slugs: string[];
  data: { title: string; description?: string };
}

const page = (url: string, title: string, description?: string): FakePage => ({
  url,
  slugs: url.split('/').filter(Boolean),
  data: { title, description },
});

const DOC_PAGES = [
  page('/docs/second', 'Second'),
  page('/docs/first', 'First'),
  page('/docs/legacy-guide', 'Legacy guide'),
];
const EXAMPLE_PAGES = [page('/examples/one', 'Example one')];
const REFERENCE_PAGES = [
  page('/reference/glossary', 'Glossary'),
  page('/reference/v3/errors', 'Legacy errors'),
];
const TOOLKIT_PAGES = [page('/toolkits/github', 'GitHub')];

/** Sidebar order is /docs/first then /docs/second, with a trailing legacy section. */
const PAGE_TREE = {
  children: [
    { type: 'page', name: 'First', url: '/docs/first' },
    { type: 'page', name: 'Second', url: '/docs/second' },
    { type: 'separator', name: 'Direct Tool Execution Guides (Legacy)' },
    { type: 'page', name: 'Legacy guide', url: '/docs/legacy-guide' },
  ],
};

/** Deterministic stand-in for the real renderer; throws for one page to exercise the fallback. */
const fakeGetLLMText = async (p: FakePage, options?: unknown) => {
  if (p.url === '/toolkits/github') throw new Error('render failed');
  return `# ${p.data.title} (${p.url})\n\nopts=${JSON.stringify(options)}\nbody for ${p.url}`;
};

mock.module('@/lib/source', () => ({
  getLLMText: fakeGetLLMText,
  source: { pageTree: PAGE_TREE, getPages: () => DOC_PAGES },
  examplesSource: { getPages: () => EXAMPLE_PAGES },
  referenceSource: { getPages: () => REFERENCE_PAGES },
  toolkitsSource: { getPages: () => TOOLKIT_PAGES },
}));

let GET: typeof import('../../app/llms-full.txt/route').GET;

beforeAll(async () => {
  ({ GET } = await import('../../app/llms-full.txt/route'));
});

/** The pre-streaming implementation, kept here as the reference bytes. */
async function buildExpectedBody(): Promise<string> {
  const renderAll = (pages: FakePage[]) =>
    Promise.all(
      pages.map(async p => {
        try {
          return await fakeGetLLMText(p, { includeFooter: false, includeGuardrails: false });
        } catch {
          return `# ${p.data.title} (${p.url})\n\n${p.data.description || ''}`;
        }
      })
    );

  const results = [
    `# Composio Documentation\n\n> Composio powers 1000+ toolkits, tool search, context management, authentication, and a sandboxed workbench to help you build AI agents that turn intent into action.${SESSION_GUARDRAILS}\n# Documentation\n`,
    ...(await renderAll([page('/docs/first', 'First'), page('/docs/second', 'Second')])),
    '\n# Examples\n',
    ...(await renderAll(EXAMPLE_PAGES)),
    '\n# API Reference\n',
    ...(await renderAll([page('/reference/glossary', 'Glossary')])),
    '\n# Toolkits\n',
    ...(await renderAll(TOOLKIT_PAGES)),
  ];

  return results.join('\n\n---\n\n');
}

describe('/llms-full.txt', () => {
  test('streams the response body', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(res.body).toBeInstanceOf(ReadableStream);
  });

  test('streamed bytes match the joined-string output exactly', async () => {
    const body = await GET().text();
    expect(body).toBe(await buildExpectedBody());
  });

  test('arrives in more than one chunk', async () => {
    const reader = GET().body!.getReader();
    let chunks = 0;
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
      chunks++;
    }
    // One chunk per part plus one per separator: the whole corpus is never a
    // single buffer.
    expect(chunks).toBeGreaterThan(2);
  });

  test('drops legacy-section pages and v3.0 reference pages', async () => {
    const body = await GET().text();
    expect(body).not.toContain('body for /docs/legacy-guide');
    expect(body).not.toContain('/reference/v3/');
  });

  test('keeps sidebar order for docs pages', async () => {
    const body = await GET().text();
    expect(body.indexOf('body for /docs/first')).toBeLessThan(body.indexOf('body for /docs/second'));
  });

  test('falls back to title and description when a page fails to render', async () => {
    const body = await GET().text();
    expect(body).toContain('# GitHub (/toolkits/github)');
    expect(body).not.toContain('body for /toolkits/github');
  });
});
