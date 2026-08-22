import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildKbCatalog } from '@/lib/kb/catalog';
import {
  createKbArticleReader,
  getKbCatalog,
  getPublishedKbGuides,
  resolveKbAlias,
} from '@/lib/kb/repository';
import type { KbManifest } from '@/lib/kb/types';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const source = `---
type: reference
title: Example
description: Public example.
category: platform/example
visibility: public
timestamp: 2026-07-20T00:00:00Z
tags:
  - example
---
# Example

## Stable answer

This is safe public guidance.

## Second answer

This is the second safe answer.
`;

function manifest(overrides: Partial<KbManifest['guides'][number]> = {}): KbManifest {
  return {
    schemaVersion: 2,
    source: {
      repository: 'ComposioHQ/example-knowledge',
      commit: '5eed614',
      capturedAt: '2026-07-21',
      contentHash: 'sha256:fixture',
    },
    topics: [
      {
        slug: 'platform',
        title: 'Platform',
        description: 'Platform guidance.',
        featuredRank: 1,
      },
    ],
    guides: [
      {
        slug: 'stable-answer',
        title: 'Stable answer',
        description: 'A stable answer.',
        sources: [
          { sourcePath: 'kb/platform/example/public.md', sourceHeading: 'Stable answer' },
          { sourcePath: 'kb/platform/example/public.md', sourceHeading: 'Second answer' },
        ],
        topics: ['platform'],
        tags: ['example'],
        aliases: ['old-answer'],
        relatedGuides: [],
        externalResources: [],
        updatedAt: '2026-07-20',
        lastVerifiedAt: '2026-07-21',
        reviewAfter: '2027-01-17',
        freshness: 'evergreen',
        state: 'published',
        featured: true,
        ...overrides,
      },
    ],
  };
}

describe('public KB catalog', () => {
  test('assembles multiple selected public sections with their headings', () => {
    const catalog = buildKbCatalog(manifest(), () => source, new Date('2026-07-21'));
    expect(catalog.guides[0]?.body).toBe(`## Stable answer

This is safe public guidance.

## Second answer

This is the second safe answer.`);
    expect(catalog.guides[0]?.sourceMetadata).toHaveLength(2);
  });

  test('uses an authored article body while retaining exact public source provenance', () => {
    const article = `Start with the verified answer.\n\nThen follow the narrowed guidance.`;
    const catalog = buildKbCatalog(
      manifest({ articlePath: 'stable-answer.md' }),
      () => source,
      new Date('2026-07-21'),
      articlePath => {
        expect(articlePath).toBe('stable-answer.md');
        return article;
      }
    );

    expect(catalog.guides[0]?.body).toBe(article);
    expect(catalog.guides[0]?.sources).toEqual([
      { sourcePath: 'kb/platform/example/public.md', sourceHeading: 'Stable answer' },
      { sourcePath: 'kb/platform/example/public.md', sourceHeading: 'Second answer' },
    ]);
    expect(catalog.guides[0]?.sourceMetadata).toHaveLength(2);
  });

  test('requires an article reader for authored articles', () => {
    expect(() =>
      buildKbCatalog(
        manifest({ articlePath: 'stable-answer.md' }),
        () => source,
        new Date('2026-07-21')
      )
    ).toThrow('requires an article reader');
  });

  test('propagates a missing authored article file', () => {
    expect(() =>
      buildKbCatalog(
        manifest({ articlePath: 'stable-answer.md' }),
        () => source,
        new Date('2026-07-21'),
        () => {
          throw new Error('ENOENT: no such file or directory');
        }
      )
    ).toThrow('ENOENT: no such file or directory');
  });

  test('rejects an authored article whose path does not match its slug', () => {
    expect(() =>
      buildKbCatalog(
        manifest({ articlePath: 'another-answer.md' }),
        () => source,
        new Date('2026-07-21'),
        () => 'Safe body.'
      )
    ).toThrow('articlePath must equal stable-answer.md');
  });

  test('rejects an authored article path with traversal', () => {
    expect(() =>
      buildKbCatalog(
        manifest({ articlePath: '../stable-answer.md' }),
        () => source,
        new Date('2026-07-21'),
        () => 'Safe body.'
      )
    ).toThrow('articlePath must be a flat filename');
  });

  test('rejects an empty authored article', () => {
    expect(() =>
      buildKbCatalog(
        manifest({ articlePath: 'stable-answer.md' }),
        () => source,
        new Date('2026-07-21'),
        () => ' \n\t '
      )
    ).toThrow('stable-answer.md must not be empty');
  });

  test('rejects YAML frontmatter in an authored article', () => {
    expect(() =>
      buildKbCatalog(
        manifest({ articlePath: 'stable-answer.md' }),
        () => source,
        new Date('2026-07-21'),
        () => '---\ntitle: Private metadata\n---\nSafe body.'
      )
    ).toThrow('stable-answer.md must not contain YAML frontmatter');
  });

  test('rejects YAML frontmatter after leading whitespace in an authored article', () => {
    expect(() =>
      buildKbCatalog(
        manifest({ articlePath: 'stable-answer.md' }),
        () => source,
        new Date('2026-07-21'),
        () => '\n  \n---\ntitle: Private metadata\n---\nSafe body.'
      )
    ).toThrow('stable-answer.md must not contain YAML frontmatter');
  });

  test('rejects an empty string article path instead of treating it as omitted', () => {
    expect(() =>
      buildKbCatalog(
        manifest({ articlePath: '' }),
        () => source,
        new Date('2026-07-21'),
        () => 'Safe body.'
      )
    ).toThrow('articlePath must equal stable-answer.md');
  });

  test('rejects a null article path at runtime', () => {
    expect(() =>
      buildKbCatalog(
        manifest({ articlePath: null } as unknown as Partial<KbManifest['guides'][number]>),
        () => source,
        new Date('2026-07-21'),
        () => 'Safe body.'
      )
    ).toThrow('articlePath must equal stable-answer.md');
  });

  test('rejects a symlinked article that escapes the articles root', () => {
    const root = mkdtempSync(join(tmpdir(), 'composio-kb-articles-'));
    temporaryDirectories.push(root);
    const articlesRoot = join(root, 'articles');
    const benignFile = join(root, 'benign.md');
    mkdirSync(articlesRoot);
    writeFileSync(benignFile, 'Benign fixture content.', 'utf8');
    symlinkSync(benignFile, join(articlesRoot, 'stable-answer.md'));

    expect(() => createKbArticleReader(articlesRoot)('stable-answer.md')).toThrow(
      'must not be a symbolic link'
    );
  });

  test('rejects an articles root that is itself a symlink', () => {
    const root = mkdtempSync(join(tmpdir(), 'composio-kb-articles-'));
    temporaryDirectories.push(root);
    const outsideArticlesRoot = join(root, 'outside-articles');
    const symlinkedArticlesRoot = join(root, 'articles');
    mkdirSync(outsideArticlesRoot);
    writeFileSync(join(outsideArticlesRoot, 'stable-answer.md'), 'Benign fixture content.', 'utf8');
    symlinkSync(outsideArticlesRoot, symlinkedArticlesRoot);

    expect(() => createKbArticleReader(symlinkedArticlesRoot)('stable-answer.md')).toThrow(
      'KB articles root must not be a symbolic link'
    );
  });

  test('rejects private markers in authored articles', () => {
    expect(() =>
      buildKbCatalog(
        manifest({ articlePath: 'stable-answer.md' }),
        () => source,
        new Date('2026-07-21'),
        () => 'See Plain T-12345 for details.'
      )
    ).toThrow('stable-answer.md contains Plain thread reference');
  });

  test.each([
    ['candidate-only knowledge', 'This candidate-only answer must not be published.'],
    ['internal-only heading', '## Support checks\n\nDo not publish these checks.'],
  ])('rejects %s in authored articles', (_marker, article) => {
    expect(() =>
      buildKbCatalog(
        manifest({ articlePath: 'stable-answer.md' }),
        () => source,
        new Date('2026-07-21'),
        () => article,
      )
    ).toThrow('stable-answer.md contains');
  });

  test.each([
    ['candidate-only knowledge', 'This candidate-only answer must not be published.'],
    ['internal-only heading', '## Debug checklist\n\nDo not publish these checks.'],
  ])('rejects %s in referenced public source content', (_marker, replacement) => {
    expect(() =>
      buildKbCatalog(
        manifest(),
        () => source.replace('This is safe public guidance.', replacement),
        new Date('2026-07-21'),
      )
    ).toThrow('kb/platform/example/public.md contains');
  });

  test.each([
    ['guide title', { title: 'See Plain T-12345 for the answer' }],
    ['guide description', { description: 'Continue at https://acme.slack.com/archives/C123.' }],
    ['guide tag', { tags: ['example', 'candidate-only'] }],
  ])('rejects private markers in a published %s', (_field, overrides) => {
    expect(() => buildKbCatalog(
      manifest(overrides),
      () => source,
      new Date('2026-07-21'),
    )).toThrow('contains');
  });

  test.each([
    ['source title', 'title: Example', 'title: See Plain T-12345'],
    [
      'source description',
      'description: Public example.',
      'description: Read https://linear.app/composio/issue/ENG-1.',
    ],
    ['source tag', '  - example', '  - candidate-only'],
  ])('rejects private markers in a public %s', (_field, current, replacement) => {
    expect(() => buildKbCatalog(
      manifest(),
      () => source.replace(current, replacement),
      new Date('2026-07-21'),
    )).toThrow('contains');
  });

  test.each([
    ['topic title', 'title', 'See Plain T-12345'],
    ['topic description', 'description', 'Read https://linear.app/composio/issue/ENG-1.'],
  ] as const)('rejects private markers in a public %s', (_field, key, value) => {
    const input = manifest();
    input.topics[0] = { ...input.topics[0]!, [key]: value };

    expect(() => buildKbCatalog(
      input,
      () => source,
      new Date('2026-07-21'),
    )).toThrow('contains');
  });

  test('allows generic public metadata about authorization codes and internal apps', () => {
    expect(() => buildKbCatalog(
      manifest({
        title: 'Authorize an internal OAuth app',
        description: 'Understand authorization code state and token rotation.',
        tags: ['authorization-code', 'state-management'],
      }),
      () => source
        .replace('title: Example', 'title: Internal OAuth app setup')
        .replace('description: Public example.', 'description: Public authorization code guidance.')
        .replace('  - example', '  - state-management'),
      new Date('2026-07-21'),
    )).not.toThrow();
  });

  test('allows contact details in authoritative public content', () => {
    expect(() => buildKbCatalog(
      manifest(),
      () => source.replace(
        'This is safe public guidance.',
        'Contact the published support address at help@example.com.',
      ),
      new Date('2026-07-21'),
    )).not.toThrow();
  });

  test('loads every published guide and resolves every imported alias', () => {
    const published = getPublishedKbGuides();

    // The corpus grows batch by batch, so assert the invariant — the catalog
    // exposes exactly the manifest's published guides — rather than a count
    // that has to be edited on every publication.
    expect(published).toHaveLength(
      getKbCatalog().manifest.guides.filter(guide => guide.state === 'published').length
    );
    expect(published.length).toBeGreaterThan(0);
    for (const guide of published) {
      for (const alias of guide.aliases) {
        expect(resolveKbAlias(alias)).toBe(`/kb/guide/${guide.slug}`);
      }
    }
    const heldGuides = getKbCatalog().guides.filter(guide => guide.state === 'needs-review');
    // Reconciled support-knowledge contains only reviewed public leaves, so the
    // imported snapshot should not create downstream editorial holds.
    expect(heldGuides).toHaveLength(0);
  });

  test('rejects an expired published review window', () => {
    expect(() =>
      buildKbCatalog(manifest({ reviewAfter: '2026-07-20' }), () => source, new Date('2026-07-21'))
    ).toThrow('review window expired');
  });

  test('rejects private markers even when an entry is held', () => {
    expect(() =>
      buildKbCatalog(
        manifest({ state: 'needs-review', lastVerifiedAt: null, reviewAfter: null }),
        () => source.replace('safe public guidance', 'See Plain T-12345'),
        new Date('2026-07-21')
      )
    ).toThrow('Plain thread reference');
  });

  test('rejects a guide without source references', () => {
    expect(() =>
      buildKbCatalog(manifest({ sources: [] }), () => source, new Date('2026-07-21'))
    ).toThrow('requires at least one source');
  });

  test('rejects a missing referenced heading', () => {
    expect(() =>
      buildKbCatalog(
        manifest({
          sources: [
            { sourcePath: 'kb/platform/example/public.md', sourceHeading: 'Missing answer' },
          ],
        }),
        () => source,
        new Date('2026-07-21')
      )
    ).toThrow('Heading "Missing answer" was not found');
  });

  test('rejects a whole-document reference when level-two sections are present', () => {
    expect(() =>
      buildKbCatalog(
        manifest({
          sources: [{ sourcePath: 'kb/platform/example/public.md', sourceHeading: null }],
        }),
        () => source,
        new Date('2026-07-21')
      )
    ).toThrow('A source without a heading cannot contain level-two sections');
  });

  test('rejects a nonpublic referenced source', () => {
    expect(() =>
      buildKbCatalog(
        manifest({
          sources: [
            { sourcePath: 'kb/platform/example/private.md', sourceHeading: 'Stable answer' },
          ],
        }),
        () => source.replace('visibility: public', 'visibility: internal'),
        new Date('2026-07-21')
      )
    ).toThrow('kb/platform/example/private.md is not visibility: public');
  });

  test('rejects private markers in every referenced public source', () => {
    expect(() =>
      buildKbCatalog(
        manifest({
          sources: [
            { sourcePath: 'kb/platform/example/public.md', sourceHeading: 'Stable answer' },
            { sourcePath: 'kb/platform/example/other-public.md', sourceHeading: 'Second answer' },
          ],
        }),
        sourcePath =>
          sourcePath.endsWith('other-public.md')
            ? source.replace('second safe answer', 'See Plain T-12345')
            : source,
        new Date('2026-07-21')
      )
    ).toThrow('kb/platform/example/other-public.md contains Plain thread reference');
  });

  test('resolves published aliases to canonical flat guide routes', () => {
    const catalog = buildKbCatalog(manifest(), () => source, new Date('2026-07-21'));
    expect(resolveKbAlias('old-answer', catalog)).toBe('/kb/guide/stable-answer');
  });
});
