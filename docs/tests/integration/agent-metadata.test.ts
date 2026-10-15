import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { fetchPage } from './helpers';

const metadataSchema = z.object({
  canonical_url: z.url(),
  markdown_url: z.url(),
  product: z.enum(['platform', 'for-you']),
  version: z.enum(['3.1', '3.0']).nullable(),
  last_updated: z.iso.datetime().nullable(),
});

function parseMetadata(text: string) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n\n/);
  expect(match, 'Markdown starts with YAML metadata').not.toBeNull();
  return metadataSchema.parse(Bun.YAML.parse(match![1]));
}

describe('agent-readable Markdown metadata', () => {
  test('suffix, direct and negotiated representations identify the same resource', async () => {
    const responses = await Promise.all([
      fetchPage('/docs/quickstart.md'),
      fetchPage('/docs/quickstart.mdx'),
      fetchPage('/llms.mdx/docs/quickstart'),
      fetchPage('/docs/quickstart', { headers: { Accept: 'text/markdown' } }),
      fetchPage('/docs/quickstart', { headers: { Accept: 'text/plain' } }),
    ]);
    const metadata = await Promise.all(responses.map(async response => {
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/markdown');
      return parseMetadata(await response.text());
    }));
    expect(metadata[0]).toMatchObject({
      canonical_url: 'https://docs.composio.dev/docs/quickstart',
      markdown_url: 'https://docs.composio.dev/docs/quickstart.md',
      product: 'platform',
      version: null,
    });
    for (const item of metadata.slice(1)) expect(item).toEqual(metadata[0]);

    const sitemap = await (await fetchPage('/sitemap.xml')).text();
    const entry = sitemap.match(/<url>\s*<loc>https:\/\/docs\.composio\.dev\/docs\/quickstart<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/);
    expect(entry, 'known source freshness is published in the sitemap').not.toBeNull();
    expect(metadata[0].last_updated).toBe(entry![1]);
  });

  test('REST versions and product routes support filtering without guessing SDK versions', async () => {
    for (const [path, product, version] of [
      ['/reference/authenticating-to-composio', 'platform', '3.1'],
      ['/reference/v3/authentication', 'platform', '3.0'],
      ['/docs/agent-plugins', 'for-you', null],
    ] as const) {
      const response = await fetchPage(`${path}.md`);
      expect(response.status).toBe(200);
      expect(parseMetadata(await response.text())).toMatchObject({ product, version });
    }
  });

  for (const path of ['/docs/devrel-36-missing-synthetic', '/unknown-devrel-36/page']) {
    for (const negotiated of [false, true]) {
      test(`${path} (${negotiated ? 'negotiated' : 'suffix'}) stays useful without false success`, async () => {
        const response = await fetchPage(negotiated ? path : `${path}.md`,
          negotiated ? { headers: { Accept: 'text/markdown' } } : undefined);
        expect(response.status).toBe(404);
        expect(response.headers.get('content-type')).toContain('text/markdown');
        const text = await response.text();
        expect(parseMetadata(text)).toMatchObject({
          canonical_url: `https://docs.composio.dev${path}`,
          markdown_url: `https://docs.composio.dev${path}.md`,
          last_updated: null,
        });
        for (const link of ['/llms.txt', '/llms-index.txt', '/kb/search', '/docs/quickstart.md']) {
          expect(text).toContain(`](${link})`);
        }
        expect(text).not.toContain('<!DOCTYPE html>');
      });
    }
  }

  test('a missing dated changelog keeps Markdown and 404 on its direct route', async () => {
    const response = await fetchPage('/llms.mdx/docs/changelog/1900/01/01');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('text/markdown');
    expect(parseMetadata(await response.text())).toMatchObject({
      canonical_url: 'https://docs.composio.dev/docs/changelog/1900/01/01',
      markdown_url: 'https://docs.composio.dev/docs/changelog/1900/01/01.md',
      last_updated: null,
    });
  });
});
