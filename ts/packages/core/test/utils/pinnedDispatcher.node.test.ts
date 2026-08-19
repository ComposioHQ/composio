import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { createPinnedDispatcher } from '../../src/utils/pinnedDispatcher.node';

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
    const dispatcher = createPinnedDispatcher(['127.0.0.1']);

    const response = await fetch(`http://pinned.invalid:${port}/payload`, {
      dispatcher,
    } as RequestInit);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('pinned payload');
    await dispatcher.close();
  });

  it('leaves the hostname on the wire, so Host and TLS SNI are unchanged', async () => {
    const port = await startServer();
    const dispatcher = createPinnedDispatcher(['127.0.0.1']);

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
});
