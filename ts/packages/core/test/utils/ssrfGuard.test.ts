import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isBlockedIp, assertSafeFetchTarget, ssrfSafeFetch } from '../../src/utils/ssrfGuard.node';
import { ComposioBlockedInternalUrlError } from '../../src/errors/SsrfErrors';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

// eslint-disable-next-line no-restricted-imports
import { lookup } from 'node:dns/promises';

const mockLookup = vi.mocked(lookup);
const resolvesTo = (...addresses: string[]) =>
  mockLookup.mockResolvedValue(
    addresses.map(address => ({ address, family: address.includes(':') ? 6 : 4 })) as never
  );

describe('isBlockedIp', () => {
  it('blocks IPv4 loopback, private, and link-local ranges', () => {
    for (const ip of [
      '127.0.0.1',
      '127.1.2.3',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1', // CGNAT
      '0.0.0.0',
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it('allows public IPv4 addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1']) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });

  it('blocks IPv6 loopback, ULA, link-local, and mapped/compat internal addresses', () => {
    for (const ip of [
      '::1',
      '::',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '::ffff:169.254.169.254',
      // IPv4-compatible ::/96 (deprecated) — the bypass Bugbot flagged
      '::127.0.0.1',
      '::169.254.169.254',
      '::10.0.0.1',
      // ...and their normalized hex forms (what dns.lookup / URL parsing yield)
      '::7f00:1', // ::127.0.0.1
      '::a9fe:a9fe', // ::169.254.169.254
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it('allows public IPv6 and public IPv4-mapped/compat addresses', () => {
    for (const ip of ['2606:4700:4700::1111', '::ffff:8.8.8.8', '::8.8.8.8', '::808:808']) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });

  it('fails closed for non-IP strings', () => {
    expect(isBlockedIp('not-an-ip')).toBe(true);
    expect(isBlockedIp('')).toBe(true);
  });
});

describe('assertSafeFetchTarget', () => {
  beforeEach(() => mockLookup.mockReset());

  it('rejects non-http(s) schemes', async () => {
    await expect(assertSafeFetchTarget('file:///etc/passwd')).rejects.toBeInstanceOf(
      ComposioBlockedInternalUrlError
    );
    await expect(assertSafeFetchTarget('ftp://example.com/x')).rejects.toBeInstanceOf(
      ComposioBlockedInternalUrlError
    );
  });

  it('rejects a host that resolves to an internal address', async () => {
    resolvesTo('169.254.169.254');
    await expect(assertSafeFetchTarget('http://metadata.internal/latest')).rejects.toBeInstanceOf(
      ComposioBlockedInternalUrlError
    );
  });

  it('rejects when ANY resolved address is internal (DNS pinning bypass)', async () => {
    resolvesTo('93.184.216.34', '127.0.0.1');
    await expect(assertSafeFetchTarget('http://evil.example/x')).rejects.toBeInstanceOf(
      ComposioBlockedInternalUrlError
    );
  });

  it('allows a host that resolves only to public addresses', async () => {
    resolvesTo('93.184.216.34');
    await expect(assertSafeFetchTarget('https://example.com/file.pdf')).resolves.toBeUndefined();
  });

  it('blocks an IPv6 literal loopback host', async () => {
    resolvesTo('::1');
    await expect(assertSafeFetchTarget('http://[::1]:8080/x')).rejects.toBeInstanceOf(
      ComposioBlockedInternalUrlError
    );
  });
});

describe('ssrfSafeFetch', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockLookup.mockReset();
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('validates and fetches a public URL', async () => {
    resolvesTo('93.184.216.34');
    const ok = new Response('data', { status: 200 });
    mockFetch.mockResolvedValue(ok);

    const res = await ssrfSafeFetch('https://example.com/file.pdf');
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/file.pdf',
      expect.objectContaining({ redirect: 'manual' })
    );
  });

  it('re-validates redirect hops and blocks a redirect into internal space', async () => {
    // First host is public; it 302-redirects to an internal metadata endpoint.
    mockLookup
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as never)
      .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }] as never);
    mockFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      })
    );

    await expect(ssrfSafeFetch('https://public.example/redirect')).rejects.toBeInstanceOf(
      ComposioBlockedInternalUrlError
    );
    // Only the first (public) fetch runs; the internal hop is blocked before fetching.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws after exceeding the redirect budget', async () => {
    resolvesTo('93.184.216.34');
    mockFetch.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://example.com/again' } })
    );

    await expect(ssrfSafeFetch('https://example.com/start', {}, 2)).rejects.toBeInstanceOf(
      ComposioBlockedInternalUrlError
    );
  });
});
