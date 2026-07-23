import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getKbLegacySegments,
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
const articleShellSource = readFileSync(
  join(import.meta.dir, '../../components/kb/kb-article-shell.tsx'),
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

  test('uses a curated article navigation instead of listing every guide', () => {
    expect(guideLayoutSource).toContain('<KbArticleShell>');
    expect(articleShellSource).toContain('Knowledge Base home');
    expect(articleShellSource).toContain('Browse all toolkits');
    expect(articleShellSource).toContain('PRODUCT_AREAS');
    expect(articleShellSource).toContain('[grid-area:sidebar]');
    expect(articleShellSource).toContain('md:layout:[--fd-sidebar-width:268px]');
    expect(guideRouteSource).toContain('<KbMobileArticleNavigation />');
    for (const guide of getPublishedKbGuides()) {
      expect(articleShellSource).not.toContain(guide.title);
    }
  });

  test('prebuilds every published legacy path for permanent redirects', () => {
    const legacySegments = getKbLegacySegments();
    expect(legacySegments.length).toBeGreaterThanOrEqual(getPublishedKbGuides().length);
    expect(legacySegments).toContainEqual([
      'sdk-and-api',
      'pagination-limits-are-endpoint-specific',
    ]);
    expect(legacyRouteSource).toContain('generateStaticParams');
    expect(legacyRouteSource).toContain('getKbLegacySegments');
  });
});
