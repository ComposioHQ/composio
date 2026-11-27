import { describe, expect, mock, test } from 'bun:test';
import {
  createComposioClient,
  listToolkitTools,
  listToolkitTriggers,
  TOOL_PAGE_SIZE,
  TRIGGER_PAGE_LIMIT,
} from '../../lib/composio-api';

type Init = RequestInit & { next?: { revalidate?: number } };

function recordingClient(respond: (url: URL) => Response) {
  const fetcher = mock(async (input: RequestInfo | URL, _init?: Init) => respond(new URL(String(input))));
  const client = createComposioClient('test-key', { revalidate: 3600, maxRetries: 0, fetch: fetcher });
  return { client, fetcher };
}

const page = (items: unknown[], next_cursor: string | null) =>
  Response.json({ items, next_cursor, total_pages: 2, current_page: next_cursor ? 1 : 2, total_items: 3 });

describe('listToolkitTools', () => {
  test('follows next_cursor at TOOL_PAGE_SIZE, one cached request per page', async () => {
    const { client, fetcher } = recordingClient(url =>
      url.searchParams.get('cursor') === 'c2' ? page([{ slug: 'C' }], null) : page([{ slug: 'A' }, { slug: 'B' }], 'c2')
    );

    expect(await listToolkitTools(client, 'tableau')).toEqual([{ slug: 'A' }, { slug: 'B' }, { slug: 'C' }]);

    const urls = fetcher.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.map(url => url.pathname)).toEqual(['/api/v3.1/tools', '/api/v3.1/tools']);
    expect(urls.map(url => url.searchParams.get('toolkit_slug'))).toEqual(['TABLEAU', 'TABLEAU']);
    expect(urls.map(url => url.searchParams.get('limit'))).toEqual([String(TOOL_PAGE_SIZE), String(TOOL_PAGE_SIZE)]);
    expect(urls.map(url => url.searchParams.get('cursor'))).toEqual([null, 'c2']);
    expect(fetcher.mock.calls.map(([, init]) => new Headers(init?.headers).get('x-api-key'))).toEqual(['test-key', 'test-key']);
    expect(fetcher.mock.calls.map(([, init]) => init?.next)).toEqual([{ revalidate: 3600 }, { revalidate: 3600 }]);
  });
});

describe('listToolkitTriggers', () => {
  test('requests the latest trigger types of one toolkit', async () => {
    const { client, fetcher } = recordingClient(() => page([{ slug: 'GITHUB_PUSH' }], null));

    expect(await listToolkitTriggers(client, 'github')).toEqual([{ slug: 'GITHUB_PUSH' }]);
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/api/v3.1/triggers_types');
    expect(url.searchParams.get('toolkit_slugs')).toBe('GITHUB');
    expect(url.searchParams.get('toolkit_versions')).toBe('latest');
    expect(url.searchParams.get('limit')).toBe(String(TRIGGER_PAGE_LIMIT));
  });
});
