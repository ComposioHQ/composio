import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createDeprecationInterceptor,
  parseLinkHeader,
  parseDeprecationDate,
  parseSunsetDate,
  normalizePathTemplate,
  type DeprecationInfo,
} from '../../src/utils/deprecation';
import logger from '../../src/utils/logger';

describe('parseDeprecationDate', () => {
  it('parses an @<epoch> structured-field date', () => {
    const date = parseDeprecationDate('@1782345600');
    expect(date).toBeInstanceOf(Date);
    expect(date!.getTime()).toBe(1782345600 * 1000);
  });

  it('does NOT parse the literal "true" (presence is what matters, not value)', () => {
    expect(parseDeprecationDate('true')).toBeNull();
  });

  it('returns null for garbage / empty values', () => {
    expect(parseDeprecationDate('not-a-date')).toBeNull();
    expect(parseDeprecationDate('@notanumber')).toBeNull();
    expect(parseDeprecationDate('')).toBeNull();
    expect(parseDeprecationDate(null)).toBeNull();
  });
});

describe('parseSunsetDate', () => {
  it('parses an HTTP-date', () => {
    const date = parseSunsetDate('Fri, 25 Sep 2026 00:00:00 GMT');
    expect(date).toBeInstanceOf(Date);
    expect(date!.getUTCFullYear()).toBe(2026);
  });

  it('returns null for invalid input', () => {
    expect(parseSunsetDate('nonsense')).toBeNull();
    expect(parseSunsetDate(null)).toBeNull();
  });
});

describe('parseLinkHeader', () => {
  it('extracts a successor-version link', () => {
    expect(parseLinkHeader('</api/v3/new>; rel="successor-version"')).toEqual({
      successor: '/api/v3/new',
      deprecation: null,
    });
  });

  it('extracts both successor and deprecation links', () => {
    const header = '</docs/changelog>; rel="deprecation", </api/v3/new>; rel="successor-version"';
    expect(parseLinkHeader(header)).toEqual({
      successor: '/api/v3/new',
      deprecation: '/docs/changelog',
    });
  });

  it('handles unquoted rel values and empty input', () => {
    expect(parseLinkHeader('<https://d.co/x>; rel=successor-version').successor).toBe(
      'https://d.co/x'
    );
    expect(parseLinkHeader(null)).toEqual({ successor: null, deprecation: null });
    expect(parseLinkHeader('</x>; rel="prev"')).toEqual({ successor: null, deprecation: null });
  });
});

describe('normalizePathTemplate', () => {
  it('collapses uuids, numeric ids, prefixed ids and nanoids to {param}', () => {
    expect(normalizePathTemplate('/api/v3/connected_accounts/ca_1a2b3c4d')).toBe(
      '/api/v3/connected_accounts/{param}'
    );
    expect(normalizePathTemplate('/api/v3/users/12345')).toBe('/api/v3/users/{param}');
    expect(normalizePathTemplate('/api/v3/x/550e8400-e29b-41d4-a716-446655440000')).toBe(
      '/api/v3/x/{param}'
    );
    expect(normalizePathTemplate('/api/v3/x/aB3xY9zQ1mN4pR7t')).toBe('/api/v3/x/{param}');
  });

  it('leaves static segments untouched', () => {
    expect(normalizePathTemplate('/api/v3/connected_accounts')).toBe('/api/v3/connected_accounts');
  });
});

describe('createDeprecationInterceptor', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  const makeFetch = (headers: Record<string, string>) => {
    return vi.fn(async () => new Response(null, { status: 200, headers }));
  };

  it('warns on a Deprecation response', async () => {
    const fetchImpl = createDeprecationInterceptor({
      baseFetch: makeFetch({ Deprecation: '@1782345600' }),
    });
    await fetchImpl('https://api.composio.dev/api/v3/old', { method: 'POST' });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('POST /api/v3/old');
  });

  it('stays silent when the header is absent', async () => {
    const fetchImpl = createDeprecationInterceptor({ baseFetch: makeFetch({}) });
    await fetchImpl('https://api.composio.dev/api/v3/live');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns even when the value is literal "true" (presence gates the warning)', async () => {
    const fetchImpl = createDeprecationInterceptor({
      baseFetch: makeFetch({ Deprecation: 'true' }),
    });
    await fetchImpl('https://api.composio.dev/api/v3/old');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('reads Sunset and Link into the message', async () => {
    const fetchImpl = createDeprecationInterceptor({
      baseFetch: makeFetch({
        Deprecation: '@1782345600',
        Sunset: 'Fri, 25 Sep 2099 00:00:00 GMT',
        Link: '</api/v3/new>; rel="successor-version"',
      }),
    });
    await fetchImpl('https://api.composio.dev/api/v3/old');

    const message = warnSpy.mock.calls[0][0] as string;
    expect(message).toContain('Fri, 25 Sep 2099 00:00:00 GMT');
    expect(message).toContain('/api/v3/new');
    expect(message).toContain('Use /api/v3/new instead');
  });

  it('escalates wording when the sunset date is already past', async () => {
    const fetchImpl = createDeprecationInterceptor({
      baseFetch: makeFetch({
        Deprecation: '@1782345600',
        Sunset: 'Fri, 25 Sep 2015 00:00:00 GMT',
      }),
    });
    await fetchImpl('https://api.composio.dev/api/v3/old');
    expect(warnSpy.mock.calls[0][0]).toContain('may already be unavailable');
  });

  it('dedupes repeated calls (including different path params) to one warning', async () => {
    const fetchImpl = createDeprecationInterceptor({
      baseFetch: makeFetch({ Deprecation: '@1782345600' }),
    });
    await fetchImpl('https://api.composio.dev/api/v3/connected_accounts/ca_1a2b3c');
    await fetchImpl('https://api.composio.dev/api/v3/connected_accounts/ca_4d5e6f');
    await fetchImpl('https://api.composio.dev/api/v3/connected_accounts/ca_7g8h9i');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('warns separately for distinct operations', async () => {
    const fetchImpl = createDeprecationInterceptor({
      baseFetch: makeFetch({ Deprecation: '@1782345600' }),
    });
    await fetchImpl('https://api.composio.dev/api/v3/a', { method: 'GET' });
    await fetchImpl('https://api.composio.dev/api/v3/a', { method: 'POST' });
    await fetchImpl('https://api.composio.dev/api/v3/b');
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  it('still warns on a later deprecated response after an earlier non-deprecated one (same operation)', async () => {
    // Simulates an endpoint that only sets the Deprecation header on certain
    // flows (e.g. SEC-339: managed-OAuth warns, custom-auth is silent). An
    // earlier header-less response must NOT suppress a later deprecated one.
    let headers: Record<string, string> = {};
    const fetchImpl = createDeprecationInterceptor({
      baseFetch: vi.fn(async () => new Response(null, { status: 200, headers })),
    });

    await fetchImpl('https://api.composio.dev/api/v3/connected_accounts', { method: 'POST' });
    expect(warnSpy).not.toHaveBeenCalled();

    headers = { Deprecation: '@1782345600' };
    await fetchImpl('https://api.composio.dev/api/v3/connected_accounts', { method: 'POST' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('respects the opt-out', async () => {
    const onDeprecation = vi.fn();
    const fetchImpl = createDeprecationInterceptor({
      disabled: true,
      onDeprecation,
      baseFetch: makeFetch({ Deprecation: '@1782345600' }),
    });
    await fetchImpl('https://api.composio.dev/api/v3/old');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(onDeprecation).not.toHaveBeenCalled();
  });

  it('fires the onDeprecation callback with structured details', async () => {
    const received: DeprecationInfo[] = [];
    const fetchImpl = createDeprecationInterceptor({
      onDeprecation: info => received.push(info),
      baseFetch: makeFetch({
        Deprecation: '@1782345600',
        Sunset: 'Fri, 25 Sep 2099 00:00:00 GMT',
        Link: '</api/v3/new>; rel="successor-version"',
      }),
    });
    await fetchImpl('https://api.composio.dev/api/v3/connected_accounts/ca_aBcD1234', {
      method: 'POST',
    });

    expect(received).toHaveLength(1);
    const info = received[0];
    expect(info.method).toBe('POST');
    expect(info.path).toBe('/api/v3/connected_accounts/{param}');
    expect(info.deprecatedAt?.getTime()).toBe(1782345600 * 1000);
    expect(info.sunset?.getUTCFullYear()).toBe(2099);
    expect(info.successor).toBe('/api/v3/new');
  });

  it('never throws on a garbage header value and still returns the response', async () => {
    // headers.has throws → interceptor must swallow it.
    const brokenResponse = {
      headers: {
        has() {
          throw new Error('boom');
        },
      },
    } as unknown as Response;
    const fetchImpl = createDeprecationInterceptor({ baseFetch: async () => brokenResponse });
    const result = await fetchImpl('https://api.composio.dev/api/v3/old');
    expect(result).toBe(brokenResponse);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not let a throwing onDeprecation callback break the request', async () => {
    const fetchImpl = createDeprecationInterceptor({
      onDeprecation: () => {
        throw new Error('callback boom');
      },
      baseFetch: makeFetch({ Deprecation: '@1782345600' }),
    });
    const result = await fetchImpl('https://api.composio.dev/api/v3/old');
    expect(result.status).toBe(200);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('returns the original response unchanged', async () => {
    const baseFetch = makeFetch({ Deprecation: '@1782345600' });
    const fetchImpl = createDeprecationInterceptor({ baseFetch });
    const result = await fetchImpl('https://api.composio.dev/api/v3/old');
    expect(result).toBe(await baseFetch.mock.results[0].value);
  });
});
