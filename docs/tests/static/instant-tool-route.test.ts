import { afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import { NextRequest } from 'next/server';

const originalFetch = globalThis.fetch;
let getTool: typeof import('../../app/api/tools/[slug]/route').GET;

beforeAll(async () => {
  const apiKey = process.env.COMPOSIO_API_KEY;
  process.env.COMPOSIO_API_KEY = 'test-key';
  try {
    getTool = (await import('../../app/api/tools/[slug]/route')).GET;
  } finally {
    if (apiKey === undefined) delete process.env.COMPOSIO_API_KEY;
    else process.env.COMPOSIO_API_KEY = apiKey;
  }
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('tool detail Instant metadata', () => {
  for (const version of ['latest', '20260101_00']) {
    test(`only latest includes pricing metadata (${version})`, async () => {
      const instant = { supported: true, price: { description: 'API price', discount: '0' } };
      const fetchMock = mock(async () => Response.json({ instant, input_parameters: { type: 'object' } }));
      globalThis.fetch = Object.assign(fetchMock, { preconnect: originalFetch.preconnect });
      const response = await getTool(
        new NextRequest(`https://docs.composio.dev/api/tools/EXAMPLE?version=${version}`),
        { params: Promise.resolve({ slug: 'EXAMPLE' }) }
      );
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.input_parameters).toEqual({ type: 'object' });
      expect(body.instant).toEqual(version === 'latest' ? instant : undefined);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = String(fetchMock.mock.calls[0]?.[0]);
      expect(url.includes('include_pricing=true')).toBe(version === 'latest');
      expect(url).toContain(`version=${version}`);
    });
  }
});
