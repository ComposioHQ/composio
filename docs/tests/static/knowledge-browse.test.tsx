import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  getFeaturedKnowledgeLinks,
  getKnowledgeByProductArea,
  getKnowledgeByToolkit,
  getKnowledgeToolkitSummaries,
} from '@/lib/knowledge/catalog';
import { PRODUCT_AREAS } from '@/lib/knowledge/taxonomy';
import { getPublishedKbGuides } from '@/lib/kb/repository';
import { getAlgoliaSearchDocuments } from '@/lib/search-index';
import { BrowseResults } from '@/components/kb/browse-results';
import * as browseResultsModule from '@/components/kb/browse-results';
import { ToolkitGrid } from '@/components/kb/toolkit-grid';
import { KnowledgeHub } from '@/components/kb/knowledge-hub';
import { KbArticleShell } from '@/components/kb/kb-article-shell';
import type { KnowledgeLink } from '@/lib/knowledge/catalog';
import KnowledgeToolkitsPage from '@/app/(home)/kb/toolkits/page';

function source(path: string): string {
  return readFileSync(join(import.meta.dir, '../..', path), 'utf8');
}

describe('knowledge browse pages', () => {
  test('defines a valid page for every stable product area', async () => {
    const stableAreas = PRODUCT_AREAS.filter((area) => area.defaultBrowse);
    expect(stableAreas).toHaveLength(5);
    for (const area of stableAreas) {
      expect((await getKnowledgeByProductArea(area.slug)).length).toBeGreaterThan(0);
    }

    const topicRoute = source('app/(home)/kb/topic/[slug]/page.tsx');
    expect(topicRoute).toContain('isProductAreaSlug');
    expect(topicRoute).toContain('notFound()');
  });

  // Asserted against the route source rather than by invoking the page. Importing
  // an App Router page pulls in `next/navigation`, which is an opaque CJS
  // re-export (`module.exports = require('./dist/client/components/navigation')`);
  // bun has to execute Next's client internals to discover its named exports, and
  // that fails on CI Linux with "Export named 'notFound' not found". A test that
  // cannot run in CI guards nothing, so this pins the same contract — the short
  // slug redirects permanently to the canonical topic — without the fragile import.
  test('permanently redirects legacy product-area URLs before rejecting unknown topics', () => {
    const topicRoute = source('app/(home)/kb/topic/[slug]/page.tsx');
    expect(topicRoute).toContain('getProductAreaRedirect');
    expect(topicRoute.indexOf('getProductAreaRedirect(slug)'))
      .toBeLessThan(topicRoute.indexOf('isProductAreaSlug(slug)'));
    expect(topicRoute.indexOf('permanentRedirect(redirect)'))
      .toBeLessThan(topicRoute.indexOf('notFound()'));
    expect(PRODUCT_AREAS.map((area) => area.slug)).toContain(
      'authentication-and-connected-accounts'
    );
    expect(PRODUCT_AREAS.map((area) => area.slug)).not.toContain('authentication');
  });

  test('combines OAuth and verified support answers on toolkit pages', async () => {
    const toolkitGuides = getPublishedKbGuides().flatMap(guide =>
      guide.sources.flatMap(source => {
        const toolkit = source.sourcePath.match(/^toolkits\/([^/]+)\/public\.md$/)?.[1];
        return toolkit ? [{ toolkit, guide }] : [];
      }),
    );
    let combined: Awaited<ReturnType<typeof getKnowledgeByToolkit>> | null = null;
    for (const { toolkit } of toolkitGuides) {
      const links = await getKnowledgeByToolkit(toolkit);
      if (links.some(item => item.sourceType === 'oauth-guide')) {
        combined = links;
        break;
      }
    }
    expect(combined).not.toBeNull();
    expect(combined!.some(item => item.sourceType === 'kb')).toBe(true);
    expect(combined!.some(item => item.sourceType === 'oauth-guide')).toBe(true);

    const toolkitRoute = source('app/(home)/kb/toolkit/[slug]/page.tsx');
    expect(toolkitRoute).toContain('notFound()');
  });

  test('aggregates every indexed toolkit guide under its canonical toolkit slug', async () => {
    const kbRecords = (await getAlgoliaSearchDocuments())
      .filter(record => record.source_type === 'kb');
    expect(kbRecords.some(record => record.toolkit_slugs.length > 0)).toBe(true);
    for (const record of kbRecords) {
      for (const toolkit of record.toolkit_slugs) {
        expect((await getKnowledgeByToolkit(toolkit)).map(item => item.href)).toContain(
          record.canonical_url,
        );
      }
    }
  });

  test('indexes every published guide even when it is not assigned to a support topic', async () => {
    const indexedGuideUrls = new Set(
      (await getAlgoliaSearchDocuments())
        .filter((record) => record.source_type === 'kb')
        .map((record) => record.canonical_url),
    );
    const publishedGuideUrls = getPublishedKbGuides()
      .map((guide) => `/kb/guide/${guide.slug}`);

    expect(publishedGuideUrls.filter((url) => !indexedGuideUrls.has(url))).toEqual([]);
  });

  test('keeps featured links canonical and present in the corpus', async () => {
    const links = await getFeaturedKnowledgeLinks();
    expect(links.length).toBeGreaterThan(0);
    expect(new Set(links.map(item => item.href)).size).toBe(links.length);
    expect(links.every(item => item.href.startsWith('/kb/guide/') || item.href.startsWith('https://')))
      .toBe(true);
  });

  test('renders headings only for source groups with matches', () => {
    const html = renderToStaticMarkup(<BrowseResults links={[{
      title: 'Authentication',
      description: 'Understand connected accounts.',
      href: '/docs/authentication',
      sourceType: 'docs',
      sourceLabel: 'Docs',
      productAreas: ['authentication-and-connected-accounts'],
      toolkitSlugs: [],
      lastVerifiedAt: null,
    }]} />);

    expect(html).toContain('Docs');
    expect(html).not.toContain('OAuth guides');
    expect(html).not.toContain('Changelog');
    expect(html).not.toContain('target="_blank"');
  });

  test('opens only external browse results in a new tab', () => {
    const html = renderToStaticMarkup(<BrowseResults links={[{
      title: 'External answer',
      description: 'A resource hosted outside the docs site.',
      href: 'https://example.com/answer',
      sourceType: 'docs',
      sourceLabel: 'Docs',
      productAreas: [],
      toolkitSlugs: [],
      lastVerifiedAt: null,
    }]} />);

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('opens in a new tab');
  });

  test('keeps large browse groups searchable and progressively disclosed', () => {
    const links: KnowledgeLink[] = Array.from({ length: 20 }, (_, index) => ({
      title: `Answer ${index + 1}`,
      description: `Troubleshooting guidance ${index + 1}.`,
      href: `/kb/guide/answer-${index + 1}`,
      sourceType: 'kb',
      sourceLabel: 'Knowledge Base',
      productAreas: ['authentication-and-connected-accounts'],
      toolkitSlugs: [],
      lastVerifiedAt: null,
    }));
    const html = renderToStaticMarkup(<BrowseResults links={links} />);

    expect(html).toContain('name="knowledge-browse-search"');
    expect(html).toContain('Answer 12');
    expect(html).not.toContain('Answer 13');
    expect(html).toContain('Show 8 more');
  });

  test('renders a lightweight support-answer heading without duplicate controls', () => {
    const knowledgeBaseLinks: KnowledgeLink[] = Array.from({ length: 20 }, (_, index) => ({
      title: `Answer ${index + 1}`,
      description: `Troubleshooting guidance ${index + 1}.`,
      href: `/kb/guide/answer-${index + 1}`,
      sourceType: 'kb',
      sourceLabel: 'Knowledge Base',
      productAreas: ['authentication-and-connected-accounts'],
      toolkitSlugs: [],
      lastVerifiedAt: null,
    }));
    const oauthLink: KnowledgeLink = {
      title: 'Configure GitHub OAuth',
      description: 'Create credentials for GitHub.',
      href: 'https://composio.dev/auth/github',
      sourceType: 'oauth-guide',
      sourceLabel: 'OAuth',
      productAreas: ['authentication-and-connected-accounts'],
      toolkitSlugs: ['github'],
      lastVerifiedAt: null,
    };
    const html = renderToStaticMarkup(
      <BrowseResults links={[...knowledgeBaseLinks, oauthLink]} variant="topic" />,
    );

    expect(html).not.toContain('name="knowledge-browse-search"');
    expect(html).not.toContain('Knowledge Base answers');
    expect(html).toContain('Support answers');
    expect(html).toContain('>20</span>');
    expect(html).toContain('Answer 1');
    expect(html).not.toContain('Answer 13');
    expect(html).toContain('Show 8 more');
    expect(html).toContain('OAuth guides');
    expect((html.match(/target="_blank"/g) ?? []).length).toBe(1);
    expect((html.match(/rel="noopener noreferrer"/g) ?? []).length).toBe(1);
    expect((html.match(/opens in a new tab/g) ?? []).length).toBe(1);
  });

  test('renders toolkit knowledge as one labeled card collection', () => {
    const links: KnowledgeLink[] = [
      {
        title: 'HubSpot',
        description: 'Public support knowledge for HubSpot.',
        href: '/kb/guide/toolkits-hubspot',
        sourceType: 'kb',
        sourceLabel: 'Knowledge Base',
        productAreas: ['authentication-and-connected-accounts'],
        toolkitSlugs: ['hubspot'],
        lastVerifiedAt: null,
      },
      {
        title: 'How to create OAuth2 credentials for HubSpot',
        description: 'Create a HubSpot OAuth2 application.',
        href: 'https://composio.dev/auth/hubspot',
        sourceType: 'oauth-guide',
        sourceLabel: 'OAuth guide',
        productAreas: ['authentication-and-connected-accounts'],
        toolkitSlugs: ['hubspot'],
        lastVerifiedAt: null,
      },
      {
        title: 'HubSpot toolkit',
        description: 'HubSpot actions and triggers.',
        href: '/toolkits/hubspot',
        sourceType: 'toolkit',
        sourceLabel: 'Toolkit',
        productAreas: [],
        toolkitSlugs: ['hubspot'],
        lastVerifiedAt: null,
      },
    ];
    const html = renderToStaticMarkup(
      <BrowseResults links={links} variant="toolkit" toolkitName="HubSpot" />,
    );

    expect(html).toContain('aria-label="Toolkit knowledge sources"');
    expect(html).toContain('Support answer');
    expect(html).toContain('OAuth guide');
    expect(html).toContain('Toolkit');
    expect(html).toContain('HubSpot support &amp; troubleshooting');
    expect(html).toContain('HubSpot tools reference');
    expect(html).toContain('How to create OAuth2 credentials for HubSpot');
    expect(html).toContain('Setup and troubleshooting guidance for HubSpot in Composio.');
    expect(html).not.toContain('Public support knowledge for HubSpot.');
    expect(html).toContain('Create a HubSpot OAuth2 application.');
    expect(html).not.toContain('>HubSpot toolkit</h3>');
    expect(html).not.toContain('<h2');
    expect((html.match(/target="_blank"/g) ?? []).length).toBe(1);
    expect((html.match(/rel="noopener noreferrer"/g) ?? []).length).toBe(1);
  });

  test('starts guide navigation with support topics', () => {
    const html = renderToStaticMarkup(
      <KbArticleShell><main>Guide content</main></KbArticleShell>,
    );

    expect(html).not.toContain('Knowledge Base home');
    expect(html).toContain('Support topics');
    expect(html).toContain('Browse all toolkits');
  });

  test('filters browse links by their title and description', () => {
    const filterKnowledgeLinks = (
      browseResultsModule as {
        filterKnowledgeLinks?: (links: KnowledgeLink[], query: string) => KnowledgeLink[];
      }
    ).filterKnowledgeLinks;
    const links: KnowledgeLink[] = [
      {
        title: 'Reconnect GitHub',
        description: 'Restore a revoked OAuth connection.',
        href: '/kb/guide/github',
        sourceType: 'kb',
        sourceLabel: 'Knowledge Base',
        productAreas: ['authentication-and-connected-accounts'],
        toolkitSlugs: ['github'],
        lastVerifiedAt: null,
      },
      {
        title: 'Retry an action',
        description: 'Handle transient execution failures.',
        href: '/kb/guide/retries',
        sourceType: 'kb',
        sourceLabel: 'Knowledge Base',
        productAreas: ['tools-actions-and-execution'],
        toolkitSlugs: [],
        lastVerifiedAt: null,
      },
    ];

    expect(typeof filterKnowledgeLinks).toBe('function');
    expect(filterKnowledgeLinks?.(links, 'oauth github')).toEqual([links[0]]);
  });

  test('builds a searchable toolkit grid from existing toolkit data', async () => {
    const summaries = await getKnowledgeToolkitSummaries();
    const html = renderToStaticMarkup(<ToolkitGrid toolkits={summaries.slice(0, 65)} />);

    expect(summaries.length).toBeGreaterThan(50);
    expect(new Set(summaries.map(toolkit => toolkit.slug)).size).toBe(summaries.length);
    expect(html).toContain('Search toolkits');
    expect(html).toContain('name="toolkit-search"');
    expect(html).toContain('/kb/toolkit/');
    expect(html).toContain(`/kb/toolkit/${summaries[59]!.slug}`);
    expect(html).not.toContain(`/kb/toolkit/${summaries[60]!.slug}`);
    expect(html).toContain('Show 5 more');
  });

  test('labels toolkit card counts as resources', () => {
    const html = renderToStaticMarkup(<ToolkitGrid toolkits={[
      {
        slug: 'single',
        name: 'Single',
        logo: 'https://example.com/logo.png',
        category: null,
        knowledgeCount: 1,
      },
      {
        slug: 'multiple',
        name: 'Multiple',
        logo: null,
        category: null,
        knowledgeCount: 2,
      },
    ]} />);

    expect(html).toContain('1 resource');
    expect(html).toContain('2 resources');
    expect(html).not.toContain('public page');
    expect(html).toContain('width="28"');
    expect(html).toContain('height="28"');
  });

  test('keeps agent-readable KB browse copy aligned with the public UI', () => {
    const route = source('app/llms.mdx/[[...slug]]/route.ts');

    expect(route).toContain('Search support knowledge');
    expect(route).toContain('canonical public support answers and toolkit-specific fixes');
    expect(route).toContain('knowledgeCount} resource');
    expect(route).not.toContain('knowledgeCount} public page');
    expect(route).not.toContain('across every indexed Composio source');
  });

  test('renders the toolkit directory without a redundant browse eyebrow', async () => {
    const html = renderToStaticMarkup(await KnowledgeToolkitsPage());

    expect(html).toContain('Toolkit knowledge');
    expect(html).not.toContain('Browse by provider');
  });

  test('preserves the canonical toolkit commonality order for browsing', async () => {
    const summaries = await getKnowledgeToolkitSummaries();

    expect(summaries.slice(0, 6).map((toolkit) => toolkit.slug)).toEqual([
      'gmail',
      'composio',
      'github',
      'googlecalendar',
      'notion',
      'googlesheets',
    ]);
  });

  test('keeps toolkit catalog pages out of support topics while retaining toolkit browse', async () => {
    const toolkitRecords = (await getAlgoliaSearchDocuments())
      .filter((record) => record.source_type === 'toolkit');
    const html = renderToStaticMarkup(await KnowledgeHub());

    expect(toolkitRecords.length).toBeGreaterThan(0);
    expect(toolkitRecords.every((record) => record.product_areas.length === 0)).toBe(true);
    expect(html).toContain('href="/kb/toolkits"');
    expect(html).not.toContain('href="/kb/topic/composio-for-you"');
  });
});
