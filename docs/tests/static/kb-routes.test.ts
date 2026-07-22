import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getKbGuideUrl,
  getPublishedKbGuides,
  resolveKbAlias,
} from '@/lib/kb/repository';
import { knowledgeBaseSource } from '@/lib/source';

const guideRouteSource = readFileSync(
  join(import.meta.dir, '../../app/(home)/kb/guide/[slug]/page.tsx'),
  'utf8',
);
const legacyRouteSource = readFileSync(
  join(import.meta.dir, '../../app/(home)/kb/[...legacy]/page.tsx'),
  'utf8',
);
const guideLayoutSource = readFileSync(
  join(import.meta.dir, '../../app/(home)/kb/guide/layout.tsx'),
  'utf8',
);

describe('public KB routes', () => {
  test('loads the generated root and flat guide through Fumadocs', () => {
    expect(knowledgeBaseSource.getPage([])?.url).toBe('/kb');
    expect(
      knowledgeBaseSource.getPage([
        'guide',
        'pagination-limits-are-endpoint-specific',
      ])?.url,
    ).toBe('/kb/guide/pagination-limits-are-endpoint-specific');
    expect(knowledgeBaseSource.getPage(['sdk-and-api'])).toBeUndefined();
  });

  test('builds flat canonical URLs and resolves former topic routes', () => {
    const guide = getPublishedKbGuides().find(
      (candidate) => candidate.slug === 'pagination-limits-are-endpoint-specific',
    );
    expect(guide).toBeDefined();
    expect(getKbGuideUrl(guide!)).toBe('/kb/guide/pagination-limits-are-endpoint-specific');
    expect(resolveKbAlias('/kb/sdk-and-api/pagination-limits-are-endpoint-specific'))
      .toBe('/kb/guide/pagination-limits-are-endpoint-specific');
  });

  test('does not expose held content as a Fumadocs page', () => {
    expect(
      knowledgeBaseSource
        .getPages()
        .some((page) => page.url.includes('auth-config-list-pages-return-at-most-50-items')),
    ).toBe(false);
  });

  test('renders verification and feedback controls and redirects aliases before notFound', () => {
    expect(guideRouteSource).toContain('Last verified');
    expect(guideRouteSource).toContain('<Feedback page={page.url} />');
    expect(legacyRouteSource).toContain('resolveKbAlias');
    expect(legacyRouteSource.indexOf('permanentRedirect')).toBeLessThan(
      legacyRouteSource.indexOf('notFound()'),
    );
  });

  test('provides DocsPage context without exposing the generated guide tree', () => {
    expect(guideLayoutSource).toContain('<DocsLayout');
    expect(guideLayoutSource).toContain('enabled: false');
  });
});
