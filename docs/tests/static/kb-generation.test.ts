import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { generateKbContent, markdownForMdx } from '@/lib/kb/generate';
import { buildKbCatalog } from '@/lib/kb/catalog';
import { createKbArticleReader, getKbCatalog } from '@/lib/kb/repository';
import type { KbManifest } from '@/lib/kb/types';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function listFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(directory, join(entry.parentPath, entry.name)))
    .sort();
}
describe('public KB content generation', () => {
  test('makes authoritative Markdown safe for MDX without changing rendered prose', () => {
    expect(markdownForMdx([
      'Use {"field": "value"}, `<placeholder>`, and <https://example.com/path>.',
      '',
      '```ts',
      'await undeclaredClient.run();',
      '```',
    ].join('\n'))).toBe([
      'Use &#123;"field": "value"&#125;, `<placeholder>`, and [https://example.com/path](https://example.com/path).',
      '',
      '```text',
      'await undeclaredClient.run();',
      '```',
    ].join('\n'));
  });

  test('defines multi-source provenance in the KB frontmatter schema', () => {
    const sourceConfig = readFileSync(join(process.cwd(), 'source.config.ts'), 'utf8');

    expect(sourceConfig).toMatch(/sources:\s*z\s*\.\s*array\(/);
    expect(sourceConfig).toContain('sourcePath: z.string(),');
    expect(sourceConfig).toContain('sourceHeading: z.string().nullable(),');
    expect(sourceConfig).not.toContain('sourcePath: z.string().optional()');
    expect(sourceConfig).not.toContain('sourceHeading: z.string().optional()');
  });

  test('generates native Fumadocs pages for published guides only', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'composio-kb-'));
    temporaryDirectories.push(outputDir);

    const summary = generateKbContent({ outputDir });
    const files = listFiles(outputDir);

    // Counts track the manifest rather than a fixed seed size: every published
    // guide gets one page, plus index.mdx, meta.json, and guide/meta.json.
    const guides = getKbCatalog().manifest.guides;
    const publishedCount = guides.filter(guide => guide.state === 'published').length;
    const heldCount = guides.filter(guide => guide.state === 'needs-review').length;

    expect(summary).toEqual({
      published: publishedCount,
      held: heldCount,
      files: files.length,
    });
    expect(files).toHaveLength(publishedCount + 3);
    expect(files).toContain('index.mdx');
    expect(files).toContain('meta.json');
    expect(files).toContain('guide/meta.json');
    expect(files.some(file => file.startsWith('toolkits/'))).toBe(false);
    expect(files.some(file => file.startsWith('sdk-and-api/'))).toBe(false);

    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'kb/manifest.json'), 'utf8'),
    ) as KbManifest;
    const published = manifest.guides.filter(guide => guide.state === 'published');
    const newlyAuthored = published.filter(guide => guide.articlePath !== undefined);
    const held = manifest.guides.filter(guide => guide.state === 'needs-review');
    expect(published).toHaveLength(publishedCount);
    // Every published guide renders from an authored article, never from the
    // source snapshot. That keeps kb/source a verbatim copy of upstream, so it
    // stays comparable for drift detection instead of drifting under editing.
    expect(newlyAuthored).toHaveLength(published.length);
    expect(new Set(newlyAuthored.map(guide => guide.articlePath)).size).toBe(published.length);
    expect(new Set(newlyAuthored.map(guide => `/kb/guide/${guide.slug}`)).size).toBe(
      published.length
    );
    // The reconciled support-knowledge snapshot only contains reviewed public
    // leaves. Importing it must not invent editorial holds downstream.
    expect(held).toHaveLength(0);

    expect(JSON.parse(readFileSync(join(outputDir, 'meta.json'), 'utf8'))).toEqual({
      title: 'Knowledge Base',
      root: true,
      pages: ['index', 'guide'],
    });
    // Nav order is the manifest's published order, so it stays correct as
    // batches are appended rather than needing a re-listing on every publish.
    // Page order mirrors published manifest order rather than a frozen list, so
    // adding a guide does not require restating the whole corpus here.
    expect(JSON.parse(readFileSync(join(outputDir, 'guide/meta.json'), 'utf8'))).toEqual({
      title: 'Guides',
      pages: published.map(guide => guide.slug),
    });

    // Assert the transformation for every guide without making any factual KB
    // claim part of the test contract.
    for (const definition of published) {
      expect(files).toContain(`guide/${definition.slug}.mdx`);
      const generated = readFileSync(join(outputDir, 'guide', `${definition.slug}.mdx`), 'utf8');
      const body = generated.split('\n---\n').at(-1)?.trim() ?? '';
      expect(body.length).toBeGreaterThan(0);
      expect(body).not.toMatch(/\]\(\.\.?\/[^)]*public\.md/);
      expect(generated).toContain(`sourceCommit: "${manifest.source.commit}"`);
      expect(generated).toContain(`sources: ${JSON.stringify(definition.sources)}`);
      expect(generated).toContain(`lastVerifiedAt: "${definition.lastVerifiedAt}"`);
      expect(generated).toContain(`reviewAfter: "${definition.reviewAfter}"`);
      expect(generated).not.toContain('articlePath:');
    }
  });

  test('renders an editorial body read from a temporary articles root without exposing its path', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'composio-kb-'));
    temporaryDirectories.push(outputDir);
    const root = mkdtempSync(join(tmpdir(), 'composio-kb-articles-'));
    temporaryDirectories.push(root);
    const articlesRoot = join(root, 'articles');
    mkdirSync(articlesRoot);
    writeFileSync(
      join(articlesRoot, 'editorial-guide.md'),
      'This is the authored editorial body.',
      'utf8'
    );
    const manifest: KbManifest = {
      schemaVersion: 2,
      source: {
        repository: 'ComposioHQ/example-knowledge',
        commit: '5eed614',
        capturedAt: '2026-07-21',
        contentHash: 'sha256:fixture',
      },
      topics: [
        { slug: 'platform', title: 'Platform', description: 'Platform guidance.', featuredRank: 1 },
      ],
      guides: [
        {
          slug: 'editorial-guide',
          title: 'Editorial guide',
          description: 'A guide with an authored body.',
          articlePath: 'editorial-guide.md',
          sources: [
            { sourcePath: 'kb/platform/example/public.md', sourceHeading: 'Stable answer' },
          ],
          topics: ['platform'],
          tags: [],
          aliases: [],
          relatedGuides: [],
          externalResources: [],
          updatedAt: '2026-07-20',
          lastVerifiedAt: '2026-07-21',
          reviewAfter: '2027-01-17',
          freshness: 'evergreen',
          state: 'published',
          featured: false,
        },
      ],
    };
    const source = `---\ntype: reference\ntitle: Example\ndescription: Public example.\ncategory: platform/example\nvisibility: public\ntimestamp: 2026-07-20T00:00:00Z\ntags:\n  - example\n---\n# Example\n\n## Stable answer\n\nPublic source provenance.\n`;
    const catalog = buildKbCatalog(
      manifest,
      () => source,
      new Date('2026-07-21'),
      createKbArticleReader(articlesRoot)
    );
    generateKbContent({ outputDir, catalog });

    const generated = readFileSync(join(outputDir, 'guide/editorial-guide.mdx'), 'utf8');
    expect(generated).toContain('This is the authored editorial body.');
    expect(generated).toContain(
      'sources: [{"sourcePath":"kb/platform/example/public.md","sourceHeading":"Stable answer"}]'
    );
    expect(generated).not.toContain('articlePath');
  });

  test('rewrites source-repository cross-links to canonical KB guide URLs', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'composio-kb-'));
    temporaryDirectories.push(outputDir);
    const manifest: KbManifest = {
      schemaVersion: 2,
      source: {
        repository: 'ComposioHQ/example-knowledge',
        commit: '5eed614',
        capturedAt: '2026-07-21',
        contentHash: 'sha256:fixture',
      },
      topics: [],
      guides: [
        {
          slug: 'toolkits-gmail',
          title: 'Gmail',
          description: 'Gmail guidance.',
          sources: [{ sourcePath: 'toolkits/gmail/public.md', sourceHeading: null }],
          topics: [],
          tags: [],
          aliases: [],
          relatedGuides: [],
          externalResources: [],
          updatedAt: '2026-07-20',
          lastVerifiedAt: '2026-07-21',
          reviewAfter: '2027-01-17',
          freshness: 'evergreen',
          state: 'published',
          featured: false,
        },
        {
          slug: 'toolkits-googlesuper',
          title: 'Google Super',
          description: 'Google Super guidance.',
          sources: [
            { sourcePath: 'toolkits/googlesuper/public.md', sourceHeading: 'Setup' },
            { sourcePath: 'toolkits/googlesuper/public.md', sourceHeading: 'Operations' },
          ],
          topics: [],
          tags: [],
          aliases: [],
          relatedGuides: [],
          externalResources: [],
          updatedAt: '2026-07-20',
          lastVerifiedAt: '2026-07-21',
          reviewAfter: '2027-01-17',
          freshness: 'evergreen',
          state: 'published',
          featured: false,
        },
      ],
    };
    const sourceByPath = new Map([
      [
        'toolkits/gmail/public.md',
        '---\ntype: guide\ntitle: Gmail\ndescription: Gmail guidance.\ncategory: toolkits/gmail\nvisibility: public\ntimestamp: 2026-07-20T00:00:00Z\ntags:\n  - gmail\n---\n# Gmail\n\nSee [Google Super](../googlesuper/public.md#unified-auth) and [Google Super setup](../googlesuper/public.md#setup).',
      ],
      [
        'toolkits/googlesuper/public.md',
        '---\ntype: guide\ntitle: Google Super\ndescription: Google Super guidance.\ncategory: toolkits/googlesuper\nvisibility: public\ntimestamp: 2026-07-20T00:00:00Z\ntags:\n  - google\n---\n# Google Super\n\n## Setup\n\nUnified authentication.\n\n## Operations\n\nRun Google tools.',
      ],
    ]);
    const catalog = buildKbCatalog(
      manifest,
      sourcePath => sourceByPath.get(sourcePath)!,
      new Date('2026-07-21'),
    );

    generateKbContent({ outputDir, catalog });

    const generated = readFileSync(join(outputDir, 'guide/toolkits-gmail.mdx'), 'utf8');
    expect(generated).toContain(
      '[Google Super](/kb/guide/toolkits-googlesuper)',
    );
    expect(generated).toContain(
      '[Google Super setup](/kb/guide/toolkits-googlesuper#setup)',
    );
    expect(generated).not.toContain('../googlesuper/public.md');
  });

  test('detects generated content drift in check mode', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'composio-kb-'));
    temporaryDirectories.push(outputDir);

    expect(() => generateKbContent({ outputDir, check: true })).toThrow(
      'Generated KB content is out of date'
    );
  });
});
