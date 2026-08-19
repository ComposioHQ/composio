import { isIP } from 'node:net';
import { Agent } from 'undici';

/**
 * A `fetch` dispatcher that connects to `addresses` instead of resolving the
 * hostname again.
 *
 * The SSRF guard resolves a hostname to decide whether a URL is safe to fetch.
 * `fetch` would then resolve that hostname a second time when it opens the
 * socket, and the two answers need not match: a short-TTL record can answer
 * with a public address for the check and an internal one for the connect
 * (DNS rebinding). Pinning the connect to the address that was validated
 * removes the second lookup, so there is nothing left to rebind.
 *
 * Only the connect target is replaced. The request still carries the original
 * hostname in `Host` and offers it as TLS SNI, so certificate verification is
 * unchanged — connecting by IP with the IP as SNI would fail against every
 * origin whose certificate names a hostname.
 *
 * The dispatcher is handed to the runtime's own `fetch`, so callers that stub
 * `globalThis.fetch` keep working. That does tie the `undici` major to the one
 * Node's `fetch` speaks — undici 8 dispatchers are rejected by the Node
 * versions this package supports — which is why the dependency is pinned to
 * `^7`, and why `pinnedDispatcher.node.test.ts` exercises a real socket on
 * every Node version in CI rather than mocking the transport.
 */
export const createPinnedDispatcher = (addresses: ReadonlyArray<string>): Agent =>
  new Agent({
    connect: {
      lookup: (_hostname, _options, callback) => {
        // All of them, in resolver order: handing over a single address of a
        // dual-stack host would strand callers whose network cannot reach that
        // family, where the runtime would otherwise have fallen back.
        callback(
          null,
          addresses.map(address => ({ address, family: isIP(address) }))
        );
      },
    },
  });
