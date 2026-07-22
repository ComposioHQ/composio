import { describe, expect, test } from 'bun:test';
import {
  getAuthGuideRegistry,
  getAuthGuideSearchRecords,
  validateAuthGuideUrls,
} from '@/lib/knowledge/auth-guides';
import {
  buildCompleteSearchReplacement,
  replaceSearchDocuments,
} from '@/lib/knowledge/search-replacement';

const expectedSlugs = [
  'trello', 'gong', 'ramp', 'pagerduty', 'github', 'docusign', 'apollo',
  'rocketlane', 'telegram', 'linear', 'calendly', 'supabase', 'notion',
  'ticktick', 'workday', 'twitter', 'dropbox', 'zendesk', 'confluence',
  'instantly', 'posthog', 'stripe', 'strava', 'snowflake', 'zoho', 'monday',
  'pipedrive', 'slack', 'shopify', 'xero', 'jira', 'linkedin', 'outlook',
  'gitlab', 'canva', 'facebook', 'salesforce', 'asana', 'googleapps', 'zoom',
  'hubspot', 'airtable', 'daytona',
];

describe('OAuth guide indexing', () => {
  test('pins the exact 43-guide public inventory', () => {
    const entries = getAuthGuideRegistry();

    expect(entries.map((entry) => entry.slug)).toEqual(expectedSlugs);
    expect(new Set(entries.map((entry) => entry.slug)).size).toBe(43);
    expect(new Set(entries.map((entry) => entry.canonicalUrl)).size).toBe(43);
    expect(entries.every((entry) => entry.canonicalUrl === `https://composio.dev/auth/${entry.slug}`))
      .toBe(true);
    expect(entries.every((entry) => entry.title.trim() && entry.description.trim()))
      .toBe(true);
  });

  test('creates one normalized OAuth search record per guide', () => {
    const records = getAuthGuideSearchRecords();

    expect(records).toHaveLength(43);
    expect(records.every((record) => record.source_type === 'oauth-guide')).toBe(true);
    expect(records.every((record) => record.product_areas.includes('authentication-and-connected-accounts')))
      .toBe(true);
    expect(records.every((record) => record.toolkit_slugs.length === 1)).toBe(true);
    expect(records.find((record) => record.canonical_url.endsWith('/github')))
      .toMatchObject({ toolkit_slugs: ['github'], page_rank: 1_700 });
  });

  test('reports the URL when any external guide is unavailable', async () => {
    const entries = getAuthGuideRegistry().slice(0, 2);
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      return new Response(null, { status: url.endsWith('/gong') ? 503 : 200 });
    };

    await expect(validateAuthGuideUrls(entries, fetchImpl as typeof fetch))
      .rejects.toThrow('https://composio.dev/auth/gong');
  });

  test('builds the full replacement only after all 43 URLs validate', async () => {
    const visited: string[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      visited.push(String(input));
      return new Response(null, { status: 200 });
    };

    const records = await buildCompleteSearchReplacement({ fetchImpl: fetchImpl as typeof fetch });

    expect(visited).toHaveLength(43);
    expect(records.filter((record) => record.source_type === 'oauth-guide')).toHaveLength(43);
  });

  test('never calls Algolia replacement after external validation fails', async () => {
    let replacementCalls = 0;
    const client = {
      async replaceAllObjects() {
        replacementCalls += 1;
      },
    };
    const fetchImpl = async (input: string | URL | Request) => new Response(null, {
      status: String(input).endsWith('/github') ? 503 : 200,
    });

    await expect(replaceSearchDocuments(client, 'docs_composio', {
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toThrow('https://composio.dev/auth/github');
    expect(replacementCalls).toBe(0);
  });
});
