import { describe, expect, test } from 'bun:test';
import { buildKbCatalog } from '@/lib/kb/catalog';
import { getKbCatalog, getPublishedKbGuides, resolveKbAlias } from '@/lib/kb/repository';
import type { KbManifest } from '@/lib/kb/types';

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
      repository: 'ComposioHQ/support-workflows',
      commit: '5eed614',
      capturedAt: '2026-07-21',
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
      (articlePath) => {
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

  test('loads the first ten published guides and one held guide from the pinned snapshot', () => {
    const published = getPublishedKbGuides();

    expect(published).toHaveLength(10);
    expect(published.map(guide => guide.slug)).toEqual(
      expect.arrayContaining([
        'deduplicate-trigger-webhook-deliveries',
        'custom-connection-data-fields-are-toolkit-specific',
        'ahrefs-actions-use-the-api-host',
        'use-calendly-post-invitee',
        'use-canva-autofill-jobs-for-design-content',
        'granola-mcp-metadata-comes-from-the-upstream-server',
        'inspect-odoo-json-rpc-errors-inside-http-200-responses',
        'strava-athlete-limits-belong-to-the-oauth-app',
      ])
    );
    expect(getKbCatalog().guides.filter(guide => guide.state === 'needs-review')).toHaveLength(1);
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
