import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import type { Agent } from 'undici';

/**
 * The `globalThis` symbols that hold the process-wide dispatcher `fetch` falls
 * back to. Every undici in the process shares them — including the one inside
 * the Node runtime — and `setGlobalDispatcher` writes both, so reading them
 * directly sees the same dispatcher the runtime's own `fetch` would use.
 *
 * Read rather than imported: importing `undici` installs a dispatcher of its
 * own as an import side effect (see {@link loadUndici}), which is exactly what
 * this module must not do at load time.
 */
const GLOBAL_DISPATCHER_SYMBOLS = [
  Symbol.for('undici.globalDispatcher.1'),
  Symbol.for('undici.globalDispatcher.2'),
] as const;

/**
 * `undici`, imported on first use rather than at module load.
 *
 * Importing it runs `if (getGlobalDispatcher() === undefined) setGlobalDispatcher(new Agent())`
 * as a side effect, which would hand every unrelated `fetch` in the host
 * application this package's undici instead of the runtime's own — a global
 * change no caller asked for by importing `@composio/core`. Deferring the
 * import to the first pinned request keeps that side effect on the code path
 * that actually needs undici, and behind the `hasCustomGlobalDispatcher` check
 * that reads the slot's true, pre-import state.
 *
 * A process that does make a pinned request still ends up on this package's
 * `Agent` if nothing had claimed the slot yet. That much is not reversible:
 * undici defines the slot non-configurable and writable, so it cannot be
 * cleared back to empty — assigning `undefined` leaves the runtime's own
 * `fetch` asserting on a missing dispatcher.
 */
let undici: Promise<typeof import('undici')> | undefined;
const loadUndici = (): Promise<typeof import('undici')> => (undici ??= import('undici'));

const lookupPinnedAddresses = (
  addresses: ReadonlyArray<string>,
  options: { all?: boolean },
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | Array<{ address: string; family: number }>,
    family?: number
  ) => void
) => {
  if (options.all) {
    callback(
      null,
      addresses.map(address => ({ address, family: isIP(address) }))
    );
    return;
  }

  const [address] = addresses;
  callback(null, address, isIP(address));
};

const knownBodyLength = (body: BodyInit | null | undefined): number | undefined => {
  if (body === null || body === undefined) return undefined;
  if (typeof body === 'string') return new TextEncoder().encode(body).byteLength;
  if (body instanceof URLSearchParams) return new TextEncoder().encode(body.toString()).byteLength;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  if (body instanceof Blob) return body.size;
  return undefined;
};

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
export const createPinnedDispatcher = async (addresses: ReadonlyArray<string>): Promise<Agent> => {
  const { Agent } = await loadUndici();

  return new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        // Node calls a lookup in one of two shapes and picks between them at
        // connect time: `(err, addresses)` when it is doing Happy Eyeballs,
        // and `(err, address, family)` otherwise — when `autoSelectFamily` is
        // off, or a `family`/`localAddress` was requested. Answering in the
        // wrong shape is rejected as an invalid address, which would fail
        // every pinned fetch in such a process.
        lookupPinnedAddresses(addresses, options, callback);
      },
    },
  });
};

/**
 * Fetch through the Node-compatible HTTP client while pinning DNS resolution.
 *
 * Bun implements the Node HTTP client and its `lookup` hook, but its native
 * `fetch` ignores undici's `dispatcher` option. This transport preserves the
 * original hostname for Host and TLS SNI while making the socket use an
 * address that the SSRF guard already validated.
 */
export const pinnedHttpFetch = async (
  rawUrl: string,
  init: RequestInit,
  addresses: ReadonlyArray<string>
): Promise<Response> => {
  const normalized = new Request(rawUrl, init);
  const url = new URL(rawUrl);
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const headers = new Headers(normalized.headers);
  const bodyLength = knownBodyLength(init.body);
  if (bodyLength !== undefined && !headers.has('content-length')) {
    headers.set('content-length', String(bodyLength));
  }

  return new Promise<Response>((resolve, reject) => {
    const outgoing = request(
      url,
      {
        method: normalized.method,
        headers: Object.fromEntries(headers.entries()),
        signal: normalized.signal,
        lookup: (_hostname, options, callback) =>
          lookupPinnedAddresses(addresses, options, callback),
      },
      incoming => {
        const headers = new Headers();
        for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
          headers.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
        }

        const status = incoming.statusCode ?? 500;
        const body = [101, 103, 204, 205, 304].includes(status)
          ? null
          : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>);
        resolve(
          new Response(body, {
            status,
            statusText: incoming.statusMessage,
            headers,
          })
        );
      }
    );

    outgoing.once('error', reject);

    void (async () => {
      try {
        if (normalized.body) {
          const reader = normalized.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!outgoing.write(value)) {
              await new Promise<void>(resolveDrain => outgoing.once('drain', resolveDrain));
            }
          }
        }
        outgoing.end();
      } catch (error) {
        outgoing.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  });
};

/**
 * Whether the process-wide dispatcher `fetch` falls back to (when a request
 * carries no `dispatcher` of its own) is something other than a stock `Agent`.
 *
 * A `ProxyAgent`, `EnvHttpProxyAgent`, or custom dispatcher installed through
 * `setGlobalDispatcher` is visible here, and pinning stands down for it: the
 * connect would dial the validated origin instead of that route's next hop.
 *
 * Nothing installed yet is *not* custom. The dispatcher slot is empty until
 * either the runtime's `fetch` or an undici import fills it, so an absent
 * dispatcher means no caller has configured a route — treating it as custom
 * would disable pinning for every process that had not yet made a request.
 *
 * Stock-ness is compared by constructor *name*, deliberately not with
 * `instanceof Agent`: an `Agent` created by the runtime's internal undici is a
 * different class from this package's `Agent`, so once the runtime's own
 * `fetch` has initialized its default dispatcher, an `instanceof` check would
 * report a stock setup as custom and silently disable pinning.
 */
export const hasCustomGlobalDispatcher = (): boolean => {
  const slots = globalThis as unknown as Record<symbol, { constructor?: { name?: string } }>;
  const dispatcher = GLOBAL_DISPATCHER_SYMBOLS.map(symbol => slots[symbol]).find(
    installed => installed !== undefined
  );

  return dispatcher !== undefined && dispatcher.constructor?.name !== 'Agent';
};
