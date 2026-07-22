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
`;

function manifest(
  overrides: Partial<KbManifest['guides'][number]> = {},
): KbManifest {
  return {
    schemaVersion: 1,
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
        sourcePath: 'kb/platform/example/public.md',
        sourceHeading: 'Stable answer',
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
  test('extracts a selected public section', () => {
    const catalog = buildKbCatalog(manifest(), () => source, new Date('2026-07-21'));
    expect(catalog.guides[0]?.body).toBe('This is safe public guidance.');
  });

  test('loads the first ten published guides and one held guide from the pinned snapshot', () => {
    const published = getPublishedKbGuides();

    expect(published).toHaveLength(10);
    expect(published.map((guide) => guide.slug)).toEqual(
      expect.arrayContaining([
        'deduplicate-trigger-webhook-deliveries',
        'custom-connection-data-fields-are-toolkit-specific',
        'ahrefs-actions-use-the-api-host',
        'use-calendly-post-invitee',
        'use-canva-autofill-jobs-for-design-content',
        'granola-mcp-metadata-comes-from-the-upstream-server',
        'inspect-odoo-json-rpc-errors-inside-http-200-responses',
        'strava-athlete-limits-belong-to-the-oauth-app',
      ]),
    );
    expect(getKbCatalog().guides.filter((guide) => guide.state === 'needs-review')).toHaveLength(1);
  });

  test('rejects an expired published review window', () => {
    expect(() =>
      buildKbCatalog(
        manifest({ reviewAfter: '2026-07-20' }),
        () => source,
        new Date('2026-07-21'),
      ),
    ).toThrow('review window expired');
  });

  test('rejects private markers even when an entry is held', () => {
    expect(() =>
      buildKbCatalog(
        manifest({ state: 'needs-review', lastVerifiedAt: null, reviewAfter: null }),
        () => source.replace('safe public guidance', 'See Plain T-12345'),
        new Date('2026-07-21'),
      ),
    ).toThrow('Plain thread reference');
  });

  test('resolves published aliases to canonical flat guide routes', () => {
    const catalog = buildKbCatalog(manifest(), () => source, new Date('2026-07-21'));
    expect(resolveKbAlias('old-answer', catalog)).toBe('/kb/guide/stable-answer');
  });
});
