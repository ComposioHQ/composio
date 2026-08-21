import { describe, expect, test } from 'bun:test';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getAlgoliaSearchDocuments } from '@/lib/search-index';

const DOCS_DIR = join(import.meta.dir, '../..');
const CONNECT_PAGE = join(DOCS_DIR, 'content/docs/composio-connect.mdx');
const VIDEO_TAG = /<Video\b[^>]*\/>/g;
const VIDEO_SRC = /\bsrc="([^"]+)"/;
const VIDEO_POSTER = /\bposter="([^"]+)"/;

const PINNED_CLIENT_TERMS = [
  'Claude Code',
  'Claude Cowork',
  'Claude Desktop',
  'ChatGPT',
  'OpenClaw',
  'Hermes',
  'Cursor',
  'Notion',
  'Codex',
  'Warp',
  'Grok',
  'Gemini CLI',
  'VS Code',
  'Devin Desktop',
  'Windsurf',
  'Antigravity',
  'OpenAI Agent Builder',
  'Agent Builder',
  'n8n',
  'Generic MCP URL',
];

describe('Composio For You client snapshot', () => {
  test('makes every pinned client and alias searchable from Composio Connect', async () => {
    const records = await getAlgoliaSearchDocuments();
    const pageRecords = records.filter(record => record.canonical_url === '/docs/composio-connect');
    const searchableContent = pageRecords
      .map(record => [record.title, record.description, record.content].filter(Boolean).join('\n'))
      .join('\n');

    expect(pageRecords.length).toBeGreaterThan(0);
    for (const term of PINNED_CLIENT_TERMS) {
      expect(searchableContent).toContain(term);
    }
  });

  test('contains no copied credentials, dashboard links, or account identifiers', async () => {
    const source = await readFile(CONNECT_PAGE, 'utf8');

    expect(source).not.toMatch(/\b(?:ck|ak)_[A-Za-z0-9_-]+/);
    expect(source).not.toMatch(/\b(?:org|organization|session)_[A-Za-z0-9_-]+/i);
    expect(source).not.toMatch(/https?:\/\/(?:[a-z0-9-]+\.)?dashboard\.composio\.dev\b/i);
    expect(source).not.toMatch(
      /\/(?:organization|org|session)s?\/(?:[A-Za-z0-9_-]{8,}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:[/?#]|$)/i,
    );
  });

  test('ships every optional onboarding video and poster referenced by the page', async () => {
    const source = await readFile(CONNECT_PAGE, 'utf8');
    const videoTags = [...source.matchAll(VIDEO_TAG)].map(match => match[0]);

    expect(videoTags).toHaveLength(7);
    const mediaPaths = videoTags.flatMap(tag => {
      const src = tag.match(VIDEO_SRC)?.[1];
      const poster = tag.match(VIDEO_POSTER)?.[1];

      expect(src).toMatch(/^\/videos\/.+\.mp4$/);
      expect(poster).toMatch(/^\/videos\/.+-poster\.jpg$/);
      return [src, poster].filter((path): path is string => Boolean(path));
    });

    expect(mediaPaths).toHaveLength(14);
    await Promise.all(mediaPaths.map(path => access(join(DOCS_DIR, 'public', path.slice(1)))));
  });
});
