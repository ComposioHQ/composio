import { isIP } from 'node:net';
import { Agent, getGlobalDispatcher } from 'undici';

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

/**
 * Whether the process-wide dispatcher `fetch` falls back to (when a request
 * carries no `dispatcher` of its own) is something other than a stock `Agent`.
 *
 * The global dispatcher lives on a `globalThis` symbol shared by every undici
 * instance in the process — including the one inside the Node runtime — so
 * this reads the same dispatcher the runtime's own `fetch` would use, and a
 * `ProxyAgent`, `EnvHttpProxyAgent`, or custom dispatcher installed through
 * `setGlobalDispatcher` is visible here.
 *
 * Stock-ness is compared by constructor *name*, deliberately not with
 * `instanceof Agent`: an `Agent` created by the runtime's internal undici is a
 * different class from this package's `Agent`, so once the runtime's own
 * `fetch` has initialized its default dispatcher, an `instanceof` check would
 * report a stock setup as custom and silently disable pinning.
 */
export const hasCustomGlobalDispatcher = (): boolean => {
  const dispatcher = getGlobalDispatcher() as { constructor?: { name?: string } };
  return dispatcher.constructor?.name !== 'Agent';
};
