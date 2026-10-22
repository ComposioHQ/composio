import { describe, expect, test } from 'bun:test';
import { getPublishedKbGuides } from '@/lib/kb/repository';
import { getKnowledgeToolkitSummaries } from '@/lib/knowledge/catalog';
import { getToolkitKnowledgeRedirect } from '@/lib/knowledge/toolkit-routing';
import { fetchNoRedirect, fetchPage } from './helpers';

function markdownAlternates(html: string): string[] {
  return (html.match(/<link\b[^>]*>/g) ?? [])
    .filter(tag => /\brel="alternate"/.test(tag) && /\btype="text\/markdown"/.test(tag))
    .map(tag => tag.match(/\bhref="([^"]+)"/)![1]);
}

async function expectDiscoverableMarkdown(pathname: string) {
  const html = await fetchPage(pathname, {
    headers: { Accept: 'text/html', 'User-Agent': 'facebookexternalhit/1.1' },
    timeout: 30_000,
  });
  expect(html.status).toBe(200);
  expect(html.headers.get('content-type')).toContain('text/html');
  const links = markdownAlternates(await html.text());
  expect(links).toHaveLength(1);
  const alternate = new URL(links[0], html.url);
  expect(alternate.pathname).toBe(`${pathname}.md`);
  expect(alternate.search).toBe('');

  // Follow the public alternate on the test server, not the metadataBase host.
  const markdown = await fetchPage(alternate.pathname, { timeout: 30_000 });
  expect(markdown.status).toBe(200);
  expect(markdown.headers.get('content-type')).toContain('text/markdown');
}

describe('HTML Markdown alternate discovery', () => {
  for (const pathname of [
    '/docs',
    '/docs/quickstart',
    '/examples',
    '/examples/custom-tools',
    '/reference',
    '/reference/v3',
    '/reference/api-reference/files/postFilesUploadRequest',
    '/reference/v3/api-reference/files/postFilesUploadRequest',
    '/toolkits',
    '/toolkits/github',
    '/toolkits/managed-auth',
    '/toolkits/meta-tools',
    '/toolkits/meta-tools/search_tools',
    '/kb',
    '/kb/search',
    '/kb/toolkits',
    '/kb/topic/authentication-and-connected-accounts',
  ]) {
    test(`${pathname} advertises a working public Markdown alternate`, async () => {
      await expectDiscoverableMarkdown(pathname);
    });
  }

  test('published KB guides advertise their own Markdown URL', async () => {
    const guide = getPublishedKbGuides()[0];
    expect(guide).toBeDefined();
    await expectDiscoverableMarkdown(`/kb/guide/${guide.slug}`);
  });

  test('nonredirecting toolkit knowledge pages advertise their own Markdown URL', async () => {
    const toolkit = (await getKnowledgeToolkitSummaries()).find(candidate => !getToolkitKnowledgeRedirect(candidate));
    expect(toolkit).toBeDefined();
    await expectDiscoverableMarkdown(`/kb/toolkit/${toolkit!.slug}`);
  });

  test('historical changelog HTML paths retain their canonical redirects', async () => {
    for (const pathname of ['/docs/changelog', '/docs/changelog/1900/01/01']) {
      const response = await fetchNoRedirect(pathname, { headers: { Accept: 'text/html' } });
      expect(response.status).toBe(308);
      expect(new URL(response.headers.get('location')!, response.url).pathname).toBe('/reference/changelog');
    }
  });

  test('HTML-only reference changelog does not advertise unsupported Markdown', async () => {
    const response = await fetchPage('/reference/changelog');
    expect(response.status).toBe(200);
    expect(markdownAlternates(await response.text())).toEqual([]);
  });
});

describe('Negotiated HTTP cache variance', () => {
  for (const accept of ['text/html', 'text/markdown', 'text/plain']) {
    test(`${accept} responses retain Vary: Accept`, async () => {
      const response = await fetchPage('/docs/quickstart', { headers: { Accept: accept } });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain(accept === 'text/html' ? 'text/html' : 'text/markdown');
      const vary = (response.headers.get('vary') ?? '').toLowerCase().split(',').map(value => value.trim());
      expect(vary).toContain('accept');
      if (accept === 'text/html') {
        expect(vary).toContain('rsc');
        expect(vary).toContain('next-router-state-tree');
      }
    });
  }

  test('HTML Fern redirects vary on Accept without changing their destination', async () => {
    const response = await fetchNoRedirect('/reference/api-reference/files/post-files-upload-request', {
      headers: { Accept: 'text/html' },
    });
    expect(response.status).toBe(301);
    expect(new URL(response.headers.get('location')!, response.url).pathname).toBe('/reference/api-reference/files/postFilesUploadRequest');
    expect((response.headers.get('vary') ?? '').toLowerCase().split(',').map(value => value.trim())).toContain('accept');
  });
});
