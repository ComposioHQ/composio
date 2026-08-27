import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { getDefaultAutoSelectFamily, setDefaultAutoSelectFamily, type AddressInfo } from 'node:net';
import { Agent, ProxyAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import {
  createPinnedDispatcher,
  hasCustomGlobalDispatcher,
} from '../../src/utils/pinnedDispatcher.node';

/**
 * The SSRF guard resolves a hostname to validate it. If `fetch` then resolves
 * that hostname again to open the socket, the two answers can differ — a
 * short-TTL record can answer publicly for the check and internally for the
 * connect (DNS rebinding, issue #4151).
 *
 * These tests use a real server and a hostname under `.invalid`, which RFC 2606
 * guarantees never resolves. A request that arrives at the server therefore
 * proves the connect used the pinned address and never consulted DNS — which is
 * exactly the property that closes the rebinding window.
 */
describe('createPinnedDispatcher', () => {
  let server: Server | undefined;
  const hosts: string[] = [];

  const startServer = async (): Promise<number> => {
    server = createServer((request, response) => {
      hosts.push(request.headers.host ?? '');
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('pinned payload');
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    return (server!.address() as AddressInfo).port;
  };

  afterEach(async () => {
    hosts.length = 0;
    if (server) {
      await new Promise<void>(resolve => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('connects to the pinned address instead of resolving the hostname', async () => {
    const port = await startServer();
    const dispatcher = await createPinnedDispatcher(['127.0.0.1']);

    const response = await fetch(`http://pinned.invalid:${port}/payload`, {
      dispatcher,
    } as RequestInit);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('pinned payload');
    await dispatcher.close();
  });

  it('leaves the hostname on the wire, so Host and TLS SNI are unchanged', async () => {
    const port = await startServer();
    const dispatcher = await createPinnedDispatcher(['127.0.0.1']);

    await fetch(`http://pinned.invalid:${port}/payload`, { dispatcher } as RequestInit);

    // Pinning by rewriting the URL to the IP would send `Host: 127.0.0.1` and
    // offer the IP as SNI, failing certificate verification against every
    // origin whose certificate names a hostname.
    expect(hosts).toEqual([`pinned.invalid:${port}`]);
    await dispatcher.close();
  });

  it('is the only reason the request lands: unpinned, the hostname does not resolve', async () => {
    const port = await startServer();

    await expect(fetch(`http://pinned.invalid:${port}/payload`)).rejects.toThrow();
    expect(hosts).toEqual([]);
  });

  it('pins just as well with Happy Eyeballs off, which asks for one address', async () => {
    // Node calls the lookup with `all: false` here and expects a single
    // address rather than a list. A host that disables auto-select-family —
    // a common workaround for Happy Eyeballs stalls — would otherwise get
    // `ERR_INVALID_IP_ADDRESS` on every SDK fetch.
    const port = await startServer();
    const previous = getDefaultAutoSelectFamily();
    setDefaultAutoSelectFamily(false);

    try {
      const dispatcher = await createPinnedDispatcher(['127.0.0.1']);
      const response = await fetch(`http://pinned.invalid:${port}/payload`, {
        dispatcher,
      } as RequestInit);

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('pinned payload');
      await dispatcher.close();
    } finally {
      setDefaultAutoSelectFamily(previous);
    }
  });
});

describe('hasCustomGlobalDispatcher', () => {
  it('reports the stock dispatcher as not custom', () => {
    expect(hasCustomGlobalDispatcher()).toBe(false);
  });

  it('reports a configured proxy dispatcher as custom', () => {
    const previous = getGlobalDispatcher();
    setGlobalDispatcher(new ProxyAgent({ uri: 'http://127.0.0.1:9' }));
    try {
      expect(hasCustomGlobalDispatcher()).toBe(true);
    } finally {
      setGlobalDispatcher(previous);
    }
  });

  it('still calls a plain Agent stock, even when created by this package', () => {
    const previous = getGlobalDispatcher();
    setGlobalDispatcher(new Agent());
    try {
      expect(hasCustomGlobalDispatcher()).toBe(false);
    } finally {
      setGlobalDispatcher(previous);
    }
  });
});
