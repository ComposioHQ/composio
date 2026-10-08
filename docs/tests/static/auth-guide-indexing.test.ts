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

function responseAt(url: string, status = 200): Response {
  const response = new Response(null, { status });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

describe('OAuth guide indexing', () => {
  test('validates the current public inventory without pinning its contents', () => {
    const entries = getAuthGuideRegistry();

    expect(entries.length).toBeGreaterThan(0);
    expect(new Set(entries.map((entry) => entry.slug)).size).toBe(entries.length);
    expect(new Set(entries.map((entry) => entry.canonicalUrl)).size).toBe(entries.length);
    expect(entries.every((entry) => entry.canonicalUrl === `https://composio.dev/auth/${entry.slug}`))
      .toBe(true);
    expect(entries.every((entry) => entry.title.trim() && entry.description.trim()))
      .toBe(true);
  });

  test('creates one normalized OAuth search record per guide', () => {
    const entries = getAuthGuideRegistry();
    const records = getAuthGuideSearchRecords();

    expect(records).toHaveLength(entries.length);
    expect(records.every((record) => record.source_type === 'oauth-guide')).toBe(true);
    expect(records.every((record) => record.product_areas.includes('authentication-and-connected-accounts')))
      .toBe(true);
    expect(records.every((record) => record.toolkit_slugs.length === 1)).toBe(true);
    expect(records.map(record => record.canonical_url))
      .toEqual(entries.map(entry => entry.canonicalUrl));
    expect(records.every((record, index) =>
      record.toolkit_slugs[0] === entries[index]?.slug && record.page_rank === 1_700))
      .toBe(true);
  });

  test('reports the URL when any external guide is unavailable', async () => {
    const entries = getAuthGuideRegistry().slice(0, 2);
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      return responseAt(url, url.endsWith('/gong') ? 503 : 200);
    };

    await expect(validateAuthGuideUrls(entries, fetchImpl as typeof fetch))
      .rejects.toThrow('https://composio.dev/auth/gong');
  });

  test('builds the full replacement only after every registered URL validates', async () => {
    const entries = getAuthGuideRegistry();
    const visited: string[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      visited.push(url);
      return responseAt(url);
    };

    const records = await buildCompleteSearchReplacement({ fetchImpl: fetchImpl as typeof fetch });

    expect(visited).toEqual(entries.map(entry => entry.canonicalUrl));
    expect(records.filter((record) => record.source_type === 'oauth-guide'))
      .toHaveLength(entries.length);
  });

  test('never calls Algolia replacement after external validation fails', async () => {
    const [entry] = getAuthGuideRegistry();
    let replacementCalls = 0;
    const client = {
      async replaceAllObjects() {
        replacementCalls += 1;
      },
    };
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      return responseAt(url, url === entry?.canonicalUrl ? 503 : 200);
    };

    await expect(replaceSearchDocuments(client, 'docs_composio', {
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toThrow(entry?.canonicalUrl);
    expect(replacementCalls).toBe(0);
  });

  test('rejects a registered guide that redirects to a generic auth page', async () => {
    const [entry] = getAuthGuideRegistry();
    const fetchImpl = async () => responseAt('https://composio.dev/auth');

    await expect(validateAuthGuideUrls([entry], fetchImpl as typeof fetch))
      .rejects.toThrow(entry.canonicalUrl);
  });
});
