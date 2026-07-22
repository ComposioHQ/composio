import { describe, expect, test } from 'bun:test';
import {
  classifyKnowledgeRecord,
  normalizeKnowledgeKeywords,
  normalizeToolkitSlug,
} from '@/lib/knowledge/metadata';
import {
  getProductArea,
  isProductAreaSlug,
  PRODUCT_AREAS,
} from '@/lib/knowledge/taxonomy';
import { getAlgoliaSearchDocuments } from '@/lib/search-index';

describe('unified knowledge metadata', () => {
  test('defines six stable browse areas and an optional Composio For You facet', () => {
    const defaultAreas = PRODUCT_AREAS.filter((area) => area.defaultBrowse);

    expect(defaultAreas).toHaveLength(6);
    expect(defaultAreas.map((area) => area.slug)).toEqual([
      'authentication-and-connected-accounts',
      'tools-and-actions',
      'triggers-and-webhooks',
      'tool-router-mcp-and-workbench',
      'sdk-and-api',
      'projects-dashboard-and-billing',
    ]);
    expect(getProductArea('composio-for-you').defaultBrowse).toBe(false);
    expect(isProductAreaSlug('sdk-and-api')).toBe(true);
    expect(isProductAreaSlug('incidents-and-known-issues')).toBe(false);
  });

  test('maps KB topics to multiple stable product areas', () => {
    expect(classifyKnowledgeRecord({
      sourceType: 'kb',
      canonicalUrl: '/kb/guide/custom-connection-data-fields-are-toolkit-specific',
      topics: ['authentication', 'connected-accounts', 'toolkits'],
      lastVerifiedAt: '2026-07-22',
    })).toEqual({
      source_type: 'kb',
      canonical_url: '/kb/guide/custom-connection-data-fields-are-toolkit-specific',
      product_areas: ['authentication-and-connected-accounts', 'tools-and-actions'],
      toolkit_slugs: [],
      intents: ['how-to'],
      last_verified_at: '2026-07-22',
    });
  });

  test.each([
    ['/docs/auth-configuration/custom-auth-configs', 'authentication-and-connected-accounts'],
    ['/docs/providers/langchain', 'sdk-and-api'],
    ['/docs/tools-direct/executing-tools', 'tools-and-actions'],
    ['/docs/setting-up-triggers/creating-triggers', 'triggers-and-webhooks'],
    ['/docs/extending-sessions/proxy-execute', 'tool-router-mcp-and-workbench'],
    ['/docs/migration-guide/new-sdk', 'sdk-and-api'],
    ['/docs/sandbox/remote', 'tool-router-mcp-and-workbench'],
  ])('maps %s to %s', (canonicalUrl, expectedArea) => {
    const metadata = classifyKnowledgeRecord({ sourceType: 'docs', canonicalUrl });
    expect(metadata.product_areas).toContain(expectedArea);
  });

  test('normalizes toolkit and deprecated product aliases', () => {
    expect(normalizeToolkitSlug('  Google Calendar  ')).toBe('google-calendar');
    expect(normalizeKnowledgeKeywords(['Rube', 'rube MCP', 'Composio For You', 'MCP']))
      .toEqual(['Composio For You', 'MCP']);
  });

  test('classifies toolkit and reference records without prose guessing', () => {
    expect(classifyKnowledgeRecord({
      sourceType: 'toolkit',
      canonicalUrl: '/toolkits/github',
      toolkitSlugs: ['github'],
    }).toolkit_slugs).toEqual(['github']);
    expect(classifyKnowledgeRecord({
      sourceType: 'reference',
      canonicalUrl: '/reference/sdk-reference/typescript',
    })).toMatchObject({
      source_type: 'reference',
      product_areas: ['sdk-and-api'],
      intents: ['reference'],
    });
  });

  test('adds normalized metadata to every local search record', async () => {
    const records = await getAlgoliaSearchDocuments();
    const canva = records.find((record) =>
      record.url === '/kb/guide/use-canva-autofill-jobs-for-design-content');

    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => Boolean(record.canonical_url))).toBe(true);
    expect(records.every((record) => Boolean(record.source_type))).toBe(true);
    expect(records.every((record) => Array.isArray(record.product_areas))).toBe(true);
    expect(records.every((record) => Array.isArray(record.toolkit_slugs))).toBe(true);
    expect(records.every((record) => Array.isArray(record.intents))).toBe(true);
    expect(records.every((record) => !record.keywords?.some((keyword) => /\brube\b/i.test(keyword))))
      .toBe(true);
    expect(canva).toMatchObject({
      source_type: 'kb',
      canonical_url: '/kb/guide/use-canva-autofill-jobs-for-design-content',
      product_areas: ['tools-and-actions'],
      toolkit_slugs: ['canva'],
      page_rank: 1_900,
    });
  });
});
