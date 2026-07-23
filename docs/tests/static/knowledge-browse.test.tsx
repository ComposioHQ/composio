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
import { BrowseResults } from '@/components/kb/browse-results';
import { ToolkitGrid } from '@/components/kb/toolkit-grid';
import { KnowledgeHub } from '@/components/kb/knowledge-hub';
import KnowledgeTopicPage from '@/app/(home)/kb/topic/[slug]/page';

function source(path: string): string {
  return readFileSync(join(import.meta.dir, '../..', path), 'utf8');
}

describe('knowledge browse pages', () => {
  test('defines a valid page for every stable product area', async () => {
    const stableAreas = PRODUCT_AREAS.filter((area) => area.defaultBrowse);
    expect(stableAreas).toHaveLength(6);
    for (const area of stableAreas) {
      expect(Array.isArray(await getKnowledgeByProductArea(area.slug))).toBe(true);
    }

    const topicRoute = source('app/(home)/kb/topic/[slug]/page.tsx');
    expect(topicRoute).toContain('isProductAreaSlug');
    expect(topicRoute).toContain('notFound()');
  });

  test('permanently redirects the short authentication topic to its canonical route', async () => {
    await expect(KnowledgeTopicPage({
      params: Promise.resolve({ slug: 'authentication' }),
    })).rejects.toMatchObject({
      digest: 'NEXT_REDIRECT;replace;/kb/topic/authentication-and-connected-accounts;308;',
    });
  });

  test('combines OAuth and verified support answers on toolkit pages', async () => {
    const strava = await getKnowledgeByToolkit('strava');
    const canva = await getKnowledgeByToolkit('canva');

    expect(strava.map((item) => item.href)).toContain('https://composio.dev/auth/strava');
    expect(strava.map((item) => item.href)).toContain(
      '/kb/guide/strava-athlete-limits-belong-to-the-oauth-app',
    );
    expect(canva.map((item) => item.href)).toContain('https://composio.dev/auth/canva');
    expect(canva.map((item) => item.href)).toContain(
      '/kb/guide/use-canva-autofill-jobs-for-design-content',
    );

    const toolkitRoute = source('app/(home)/kb/toolkit/[slug]/page.tsx');
    expect(toolkitRoute).toContain('notFound()');
  });

  test('aggregates every newly authored toolkit answer under its relevant toolkit', async () => {
    const expectedGuides = [
      ['hubspot', 'fix-hubspot-oauth-token-exchange-400-client-secret-and-scopes'],
      ['shopify', 'choose-current-shopify-app-auth-flow'],
      ['discord', 'choose-discordbot-for-bot-token-operations'],
      ['discordbot', 'choose-discordbot-for-bot-token-operations'],
      ['outlook', 'target-outlook-shared-mailboxes-by-address'],
      ['googlesheets', 'google-sheets-oauth-cannot-be-scoped-to-a-drive-folder'],
      ['googlesheets', 'google-sheets-auth-configs-require-full-scope-uris'],
      ['googlecalendar', 'use-primary-for-google-calendar-id'],
      ['stripe', 'stripe-api-key-connections-require-a-secret-key'],
      ['snowflake', 'snowflake-account-id-uses-org-account-format'],
      ['instagram', 'stage-local-instagram-media-before-publishing'],
      ['canvas', 'resolve-canvas-account-endpoint-access-errors'],
      ['canvas', 'paginate-canvas-list-results'],
      ['slack', 'slack-admin-conversation-writes-require-enterprise'],
      ['slackbot', 'slack-private-conversations-require-separate-history-scopes'],
      ['linkedin', 'linkedin-company-actions-require-organization-scopes'],
      ['linkedin', 'fix-linkedin-426-nonexistent-version'],
      ['airtable', 'batch-airtable-record-updates-in-groups-of-10'],
    ] as const;

    for (const [toolkit, slug] of expectedGuides) {
      expect((await getKnowledgeByToolkit(toolkit)).map((item) => item.href)).toContain(
        `/kb/guide/${slug}`,
      );
    }
  });

  test('keeps featured links canonical and present in the corpus', async () => {
    expect((await getFeaturedKnowledgeLinks()).map((item) => item.href)).toEqual([
      '/kb/guide/pagination-limits-are-endpoint-specific',
      '/kb/guide/deduplicate-trigger-webhook-deliveries',
      '/kb/guide/custom-connection-data-fields-are-toolkit-specific',
      'https://composio.dev/auth/github',
    ]);
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
  });

  test('builds a searchable toolkit grid from existing toolkit data', async () => {
    const summaries = await getKnowledgeToolkitSummaries();
    const html = renderToStaticMarkup(<ToolkitGrid toolkits={summaries.slice(0, 4)} />);

    expect(summaries.length).toBeGreaterThan(50);
    expect(summaries.some((toolkit) => toolkit.slug === 'github')).toBe(true);
    expect(html).toContain('Search toolkits');
    expect(html).toContain('name="toolkit-search"');
    expect(html).toContain('/kb/toolkit/');
  });

  test('shows Composio For You on the hub only when catalog content exists', async () => {
    const composioForYou = await getKnowledgeByProductArea('composio-for-you');
    const html = renderToStaticMarkup(await KnowledgeHub());

    expect(composioForYou).toHaveLength(0);
    expect(html).not.toContain('href="/kb/topic/composio-for-you"');
  });
});
