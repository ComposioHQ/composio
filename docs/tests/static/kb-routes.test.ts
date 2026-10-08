import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  getKbLegacySegments,
  getKbGuideUrl,
  getPublishedKbGuides,
  resolveKbAlias,
} from '@/lib/kb/repository';
import { knowledgeBaseSource } from '@/lib/source';
import * as kbArticleShellModule from '@/components/kb/kb-article-shell';

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
    const guide = getPublishedKbGuides()[0];
    expect(guide).toBeDefined();
    expect(knowledgeBaseSource.getPage([])?.url).toBe('/kb');
    expect(
      knowledgeBaseSource.getPage([
        'guide',
        guide!.slug,
      ])?.url,
    ).toBe(getKbGuideUrl(guide!));
    expect(knowledgeBaseSource.getPage(['sdk-and-api'])).toBeUndefined();
  });

  test('builds flat canonical URLs and resolves imported path aliases', () => {
    const guide = getPublishedKbGuides().find(
      candidate => candidate.aliases.some(alias => alias.startsWith('/kb/')),
    );
    expect(guide).toBeDefined();
    const pathAlias = guide!.aliases.find(alias => alias.startsWith('/kb/'))!;
    expect(getKbGuideUrl(guide!)).toBe(`/kb/guide/${guide!.slug}`);
    expect(resolveKbAlias(pathAlias)).toBe(`/kb/guide/${guide!.slug}`);
  });

  test('exposes exactly one Fumadocs page per published guide', () => {
    const pageUrls = new Set(knowledgeBaseSource.getPages().map(page => page.url));
    for (const guide of getPublishedKbGuides()) {
      expect(pageUrls.has(getKbGuideUrl(guide))).toBe(true);
    }
  });

  test('renders feedback controls and redirects aliases before notFound', () => {
    expect(guideRouteSource).toContain('<Feedback page={page.url} />');
    expect(legacyRouteSource).toContain('resolveKbAlias');
    expect(legacyRouteSource.indexOf('permanentRedirect')).toBeLessThan(
      legacyRouteSource.indexOf('notFound()'),
    );
  });

  test('renders a concise last-verified date beside the existing feedback control', () => {
    const KbGuideVerification = (
      kbArticleShellModule as {
        KbGuideVerification?: ComponentType<{ lastVerifiedAt: string }>;
      }
    ).KbGuideVerification;
    expect(typeof KbGuideVerification).toBe('function');
    if (!KbGuideVerification) return;

    const html = renderToStaticMarkup(createElement(KbGuideVerification, {
      lastVerifiedAt: '2026-08-17',
    }));
    expect(html).toContain('Last verified');
    expect(html).toContain('<time dateTime="2026-08-17">Aug 17, 2026</time>');
    expect(guideRouteSource).toContain(
      '<KbGuideVerification lastVerifiedAt={lastVerifiedAt} />',
    );
    expect(guideRouteSource).toContain('<Feedback page={page.url} />');
  });

  test('provides DocsPage context without exposing the generated guide tree', () => {
    expect(guideLayoutSource).toContain('<DocsLayout');
    expect(guideLayoutSource).toContain('enabled: false');
  });

  test('uses a curated article navigation instead of listing every guide', () => {
    expect(guideLayoutSource).toContain('<KbArticleShell>');
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
    const expected = getPublishedKbGuides().flatMap(guide => guide.aliases)
      .filter(alias => alias.startsWith('/kb/'))
      .map(alias => alias.slice('/kb/'.length).split('/'));
    for (const segments of expected) expect(legacySegments).toContainEqual(segments);
    expect(legacyRouteSource).toContain('generateStaticParams');
    expect(legacyRouteSource).toContain('getKbLegacySegments');
  });
});
