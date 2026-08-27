import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import KnowledgeBaseLayout from '@/app/(home)/kb/layout';
import { KnowledgeHub } from '@/components/kb/knowledge-hub';
import {
  getKnowledgeSearchHref,
  KnowledgeSearchForm,
} from '@/components/kb/knowledge-search-form';
import { KnowledgeSearchResults } from '@/components/kb/knowledge-search-results';
import { AIToolsBanner } from '@/components/ai-tools-banner';
import * as knowledgeSearchResultsModule from '@/components/kb/knowledge-search-results';
import type { KnowledgeSearchResult } from '@/lib/knowledge/search';

const initialSearchResponse = {
  query: 'authentication',
  filter: 'all' as const,
  total: 3,
  mode: 'keyword' as const,
  results: [
    {
      objectID: 'docs-authentication',
      title: 'Authentication overview',
      excerpt: 'Configure authentication for Composio.',
      canonicalUrl: '/docs/authentication',
      sourceType: 'docs' as const,
      sourceLabel: 'Docs',
      breadcrumbs: [],
      productAreas: [],
      toolkitSlugs: [],
      lastVerifiedAt: null,
      section: null,
    },
    {
      objectID: 'toolkit-github',
      title: 'GitHub toolkit',
      excerpt: 'Use GitHub actions through Composio.',
      canonicalUrl: '/toolkits/github',
      sourceType: 'toolkit' as const,
      sourceLabel: 'Toolkit',
      breadcrumbs: [],
      productAreas: [],
      toolkitSlugs: ['github'],
      lastVerifiedAt: null,
      section: null,
    },
    {
      objectID: 'reference-tools',
      title: 'Tools API reference',
      excerpt: 'Reference for tool APIs.',
      canonicalUrl: '/reference/tools',
      sourceType: 'reference' as const,
      sourceLabel: 'Reference',
      breadcrumbs: [],
      productAreas: [],
      toolkitSlugs: [],
      lastVerifiedAt: null,
      section: null,
    },
  ],
};

function source(path: string): string {
  return readFileSync(join(import.meta.dir, '../..', path), 'utf8');
}

describe('knowledge hub', () => {
  test('does not add a second viewport height below the shared header', () => {
    const html = renderToStaticMarkup(
      <KnowledgeBaseLayout>
        <main>Short knowledge page</main>
      </KnowledgeBaseLayout>,
    );

    expect(html).not.toContain('min-h-dvh');
    expect(html).toContain('class="flex-1');
  });

  test('renders a search-first landing page with curated recovery paths', async () => {
    const html = renderToStaticMarkup(await KnowledgeHub());

    expect(html).toContain('Search Composio support knowledge');
    expect(html).not.toContain('Composio Knowledge Base');
    const linkedTopics = new Set(
      [...html.matchAll(/href="\/kb\/topic\/([a-z0-9-]+)"/g)].map((match) => match[1]),
    );
    expect(linkedTopics.size).toBe(5);
    expect(html.match(/href="\/kb\/topic\//g)?.length).toBe(linkedTopics.size);
    expect(html).toContain('Support topics');
    expect(html).toContain('Browse by toolkit');
    expect(html).toContain('View all toolkits');
    expect(html).toContain('sm:justify-between');
    expect(html).toContain('lg:grid-cols-5');
    expect(html).not.toContain('lg:col-span');
    expect(html).toContain('space-y-12');
    expect(html).not.toContain('Featured answers and guides');
    expect(html).not.toContain('href="/kb/guide/platform-pagination"');
    expect(html).not.toContain('Popular searches');
    expect(html).not.toContain('href="/kb/search?q=OAuth+errors&amp;filter=kb"');
    expect(html).toContain('width="28"');
    expect(html).toContain('height="28"');
  });

  test('keeps homepage discovery sections actionable', async () => {
    const html = renderToStaticMarkup(await KnowledgeHub());
    const discoverySections = [
      ...html.matchAll(/<section[^>]*aria-labelledby="[^"]+"[^>]*>[\s\S]*?<\/section>/g),
    ].map((match) => match[0]);

    expect(discoverySections.length).toBeGreaterThanOrEqual(2);
    expect(discoverySections.every((section) => section.includes('href='))).toBe(true);
  });

  test('builds a shareable search URL and exposes a screen-reader-only label', () => {
    expect(getKnowledgeSearchHref('oauth github'))
      .toBe('/kb/search?q=oauth+github');
    const html = renderToStaticMarkup(<KnowledgeSearchForm defaultQuery="oauth github" />);

    expect(html).toContain('<label');
    expect(html).toContain('Search support knowledge');
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('name="q"');
    expect(html).not.toContain('name="filter"');
    expect(html).toContain('focus-visible:ring-2');
    expect(html).toContain('focus-within:ring-2');
    expect(html).toContain('border-l border-fd-border');
    expect(html).not.toContain('absolute right-2');
  });

  test('renders initial results with concise mixed-source labels', () => {
    const html = renderToStaticMarkup(
      <KnowledgeSearchResults
        query="authentication"
        initialResponse={initialSearchResponse}
        failed={false}
      />,
    );

    expect(html).toContain('href="/docs/authentication"');
    expect(html).toContain('Documentation');
    expect(html).toContain('Toolkit');
    expect(html).toContain('API Reference');
    expect(html).not.toContain('Guide');
  });

  test('keeps initial search results free of mount-time fetching', () => {
    const resultsSource = source('components/kb/knowledge-search-results.tsx');

    expect(resultsSource).not.toContain('fetch(');
    expect(resultsSource).not.toContain('useEffect');
  });

  test('shows the canonical Composio skill install command and repository', () => {
    const html = renderToStaticMarkup(<AIToolsBanner />);

    expect(html).toContain('npx skills add ComposioHQ/composio --skill composio -y');
    expect(html).toContain('https://github.com/ComposioHQ/composio/tree/next/skills/composio');
    expect(html).not.toContain('npx skills add composiohq/skills');
  });

  test('identifies matching query terms for result emphasis', () => {
    const getHighlightedSegments = (
      knowledgeSearchResultsModule as {
        getHighlightedSegments?: (
          text: string,
          query: string,
        ) => Array<{ text: string; highlighted: boolean }>;
      }
    ).getHighlightedSegments;

    expect(typeof getHighlightedSegments).toBe('function');
    expect(getHighlightedSegments?.('GitHub OAuth redirect URI', 'github uri')).toEqual([
      { text: 'GitHub', highlighted: true },
      { text: ' OAuth redirect ', highlighted: false },
      { text: 'URI', highlighted: true },
    ]);
  });

  test('uses customer-facing fallback copy in search results', () => {
    const getKnowledgeSearchDisplayExcerpt = (
      knowledgeSearchResultsModule as {
        getKnowledgeSearchDisplayExcerpt?: (
          excerpt: string,
          section?: string | null,
        ) => string;
      }
    ).getKnowledgeSearchDisplayExcerpt;

    expect(typeof getKnowledgeSearchDisplayExcerpt).toBe('function');
    expect(getKnowledgeSearchDisplayExcerpt?.('Public support knowledge for Airtable.'))
      .toBe('Setup and troubleshooting guidance for Airtable in Composio.');
    expect(getKnowledgeSearchDisplayExcerpt?.('Current navigation for connecting apps.'))
      .toBe('Current navigation for connecting apps.');
    expect(getKnowledgeSearchDisplayExcerpt?.('Heading; details', 'Heading'))
      .toBe('details');
    expect(getKnowledgeSearchDisplayExcerpt?.('Heading - details', 'Heading'))
      .toBe('details');
    expect(getKnowledgeSearchDisplayExcerpt?.('Heading,', 'Heading'))
      .toBe('');
    expect(getKnowledgeSearchDisplayExcerpt?.('Sending attachments', 'Send'))
      .toBe('Sending attachments');
    expect(getKnowledgeSearchDisplayExcerpt?.('API-key authentication', 'API'))
      .toBe('API-key authentication');
  });

  test('omits the redundant guide label from search result cards', () => {
    const KnowledgeSearchResultCard = (
      knowledgeSearchResultsModule as {
        KnowledgeSearchResultCard?: ComponentType<{
          result: KnowledgeSearchResult;
          query: string;
          onClick?: () => void;
        }>;
      }
    ).KnowledgeSearchResultCard;
    expect(typeof KnowledgeSearchResultCard).toBe('function');
    if (!KnowledgeSearchResultCard) return;

    const html = renderToStaticMarkup(<KnowledgeSearchResultCard
      query="notion"
      result={{
        objectID: 'notion',
        title: 'Notion',
        excerpt: 'Troubleshoot connection and response-size issues.',
        canonicalUrl: '/kb/guide/toolkits-notion',
        sourceType: 'kb',
        sourceLabel: 'Knowledge Base',
        breadcrumbs: ['Guide'],
        productAreas: [],
        toolkitSlugs: ['notion'],
        lastVerifiedAt: '2026-08-17',
        section: null,
      }}
    />);

    expect(html).toContain('Support');
    expect(html).toContain('Notion');
    expect(html).not.toContain('Guide');
  });

  test('keeps the page title primary and renders the matched section as context', () => {
    const html = renderToStaticMarkup(
      <knowledgeSearchResultsModule.KnowledgeSearchResultCard
        query="support"
        result={{
          objectID: 'gmail-attachments',
          title: 'Gmail',
          excerpt: 'Send attachments safely, Upload files before tool execution.',
          canonicalUrl: '/kb/guide/toolkits-gmail',
          sourceType: 'kb',
          sourceLabel: 'Knowledge Base',
          breadcrumbs: ['Guide'],
          productAreas: [],
          toolkitSlugs: ['gmail'],
          lastVerifiedAt: '2026-08-17',
          section: 'Send attachments safely,',
        }}
      />,
    );

    expect(html).toContain('Support');
    expect(html).not.toContain('Support · Gmail');
    expect(html).toContain('>Gmail</h3>');
    expect(html.match(/Send attachments safely/g)?.length).toBe(1);
    expect(html).not.toContain('Send attachments safely,');
    expect(html).toContain('Upload files before tool execution.');
    expect(html.indexOf('Support')).toBeLessThan(html.indexOf('>Gmail</h3>'));
    expect(html.indexOf('>Gmail</h3>')).toBeLessThan(html.indexOf('Send '));
    expect(html.indexOf('Send ')).toBeLessThan(html.indexOf('Upload files'));
  });

  test('does not repeat a section that only differs from the page title by punctuation', () => {
    const html = renderToStaticMarkup(
      <knowledgeSearchResultsModule.KnowledgeSearchResultCard
        query="support"
        result={{
          objectID: 'gmail-overview',
          title: 'Gmail',
          excerpt: 'Gmail: Send and receive email.',
          canonicalUrl: '/toolkits/gmail',
          sourceType: 'toolkit',
          sourceLabel: 'Toolkit',
          breadcrumbs: [],
          productAreas: [],
          toolkitSlugs: ['gmail'],
          lastVerifiedAt: null,
          section: 'Gmail:',
        }}
      />,
    );

    expect(html.match(/Gmail/g)?.length).toBe(1);
    expect(html).toContain('Send and receive email.');
  });

  test('does not repeat a section-only match as its own excerpt', () => {
    const section = 'Create a SHARED Gmail connection that any userId can use,';
    const html = renderToStaticMarkup(
      <knowledgeSearchResultsModule.KnowledgeSearchResultCard
        query="gmail"
        result={{
          objectID: 'shared-gmail',
          title: 'Shared connections',
          excerpt: section,
          canonicalUrl: '/docs/shared-connections',
          sourceType: 'docs',
          sourceLabel: 'Docs',
          breadcrumbs: [],
          productAreas: [],
          toolkitSlugs: [],
          lastVerifiedAt: null,
          section,
        }}
      />,
    );

    expect(html.match(/Create a SHARED/g)?.length).toBe(1);
  });

  test('renders Markdown-formatted section context as plain text without repeating it', () => {
    const html = renderToStaticMarkup(
      <knowledgeSearchResultsModule.KnowledgeSearchResultCard
        query="context"
        result={{
          objectID: 'custom-tools-context',
          title: 'Custom Tools and Toolkits',
          excerpt: 'Context object (ctx) Every custom tool receives context.',
          canonicalUrl: '/docs/custom-tools',
          sourceType: 'docs',
          sourceLabel: 'Docs',
          breadcrumbs: [],
          productAreas: [],
          toolkitSlugs: [],
          lastVerifiedAt: null,
          section: 'Context object (`ctx`)',
        }}
      />,
    );

    expect(html).not.toContain('`');
    expect(html.match(/object \(ctx\)/g)?.length).toBe(1);
    expect(html).toContain('Every custom tool receives');
  });

  test('implements accessible result, empty, and failure states', () => {
    const resultsSource = source('components/kb/knowledge-search-results.tsx');

    expect(resultsSource).toContain('aria-live="polite"');
    expect(resultsSource).toContain('No results for');
    expect(resultsSource).toContain('Browse support topics');
    expect(resultsSource).toContain('Browse toolkits');
    expect(resultsSource).toContain('Search is temporarily unavailable');
    expect(resultsSource).toContain('source_type');
  });

  test('removes the generated Fumadocs tree from the KB layout', () => {
    const layoutSource = source('app/(home)/kb/layout.tsx');
    expect(layoutSource).not.toContain('createDocsLayout');
    expect(layoutSource).not.toContain('knowledgeBaseSource.pageTree');
  });
});
