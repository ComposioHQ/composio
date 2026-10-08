import { describe, expect, test } from 'bun:test';
import {
  classifyKnowledgeRecord,
  normalizeKnowledgeKeywords,
  normalizeToolkitSlug,
} from '@/lib/knowledge/metadata';
import { isProductAreaSlug, PRODUCT_AREAS } from '@/lib/knowledge/taxonomy';
import * as taxonomyModule from '@/lib/knowledge/taxonomy';
import { getAlgoliaSearchDocuments } from '@/lib/search-index';

describe('unified knowledge metadata', () => {
  test('defines five support topics that reflect the current corpus', () => {
    const defaultAreas = PRODUCT_AREAS.filter((area) => area.defaultBrowse);

    expect(defaultAreas).toHaveLength(5);
    expect(defaultAreas.map((area) => area.slug)).toEqual([
      'authentication-and-connected-accounts',
      'tools-actions-and-execution',
      'triggers-and-workflows',
      'sdk-api-and-mcp',
      'account-billing-and-security',
    ]);
    expect(PRODUCT_AREAS.every((area) => area.defaultBrowse)).toBe(true);
    expect(isProductAreaSlug('sdk-api-and-mcp')).toBe(true);
    expect(isProductAreaSlug('sdk-and-api')).toBe(false);
    expect(isProductAreaSlug('incidents-and-known-issues')).toBe(false);
  });

  test('maps current KB topics to a focused support topic and useful intents', () => {
    expect(classifyKnowledgeRecord({
      sourceType: 'kb',
      canonicalUrl: '/kb/guide/custom-connection-data-fields-are-toolkit-specific',
      topics: ['authentication', 'auth-config', 'errors-and-troubleshooting'],
      lastVerifiedAt: '2026-07-22',
    })).toEqual({
      source_type: 'kb',
      canonical_url: '/kb/guide/custom-connection-data-fields-are-toolkit-specific',
      product_areas: ['authentication-and-connected-accounts'],
      toolkit_slugs: [],
      intents: ['how-to', 'troubleshooting'],
      last_verified_at: '2026-07-22',
    });
  });

  test('redirects old product-area URLs to the replacement support topic', () => {
    const getProductAreaRedirect = (
      taxonomyModule as { getProductAreaRedirect?: (slug: string) => string | null }
    ).getProductAreaRedirect;

    expect(typeof getProductAreaRedirect).toBe('function');
    expect(getProductAreaRedirect?.('tools-and-actions'))
      .toBe('/kb/topic/tools-actions-and-execution');
    expect(getProductAreaRedirect?.('tool-router-mcp-and-workbench'))
      .toBe('/kb/topic/sdk-api-and-mcp');
    expect(getProductAreaRedirect?.('composio-for-you'))
      .toBe('/kb/search?q=Composio+For+You');
    expect(getProductAreaRedirect?.('not-a-topic')).toBeNull();
  });

  test.each([
    ['/docs/auth-configuration/custom-auth-configs', 'authentication-and-connected-accounts'],
    ['/docs/providers/langchain', 'sdk-api-and-mcp'],
    ['/docs/tools-direct/executing-tools', 'tools-actions-and-execution'],
    ['/docs/setting-up-triggers/creating-triggers', 'triggers-and-workflows'],
    ['/docs/extending-sessions/proxy-execute', 'tools-actions-and-execution'],
    ['/docs/migration-guide/new-sdk', 'sdk-api-and-mcp'],
    ['/docs/sandbox/remote', 'tools-actions-and-execution'],
    ['/docs/sessions-via-mcp', 'sdk-api-and-mcp'],
    ['/docs/configuring-sessions', 'tools-actions-and-execution'],
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
    })).toMatchObject({
      product_areas: [],
      toolkit_slugs: ['github'],
    });
    expect(classifyKnowledgeRecord({
      sourceType: 'reference',
      canonicalUrl: '/reference/sdk-reference/typescript',
    })).toMatchObject({
      source_type: 'reference',
      product_areas: ['sdk-api-and-mcp'],
      intents: ['reference'],
    });
  });

  test('adds normalized metadata to every local search record', async () => {
    const records = await getAlgoliaSearchDocuments();
    const toolkitKbRecord = records.find(record =>
      record.source_type === 'kb' && record.toolkit_slugs.length > 0,
    );

    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => Boolean(record.canonical_url))).toBe(true);
    expect(records.every((record) => Boolean(record.source_type))).toBe(true);
    expect(records.every((record) => Array.isArray(record.product_areas))).toBe(true);
    expect(records.every((record) => Array.isArray(record.toolkit_slugs))).toBe(true);
    expect(records.every((record) => Array.isArray(record.intents))).toBe(true);
    expect(toolkitKbRecord).toMatchObject({
      source_type: 'kb',
      page_rank: 1_900,
    });
    expect(toolkitKbRecord?.canonical_url.startsWith('/kb/guide/')).toBe(true);
    expect(toolkitKbRecord?.toolkit_slugs.every(slug => slug === normalizeToolkitSlug(slug)))
      .toBe(true);
  });
});
