import { Effect } from 'effect';

/**
 * Request and byte totals for every Composio API call a client made.
 */
export interface ClientMetrics {
  readonly byteSize: number;
  readonly requests: number;
}

export interface ClientMetricsCollector {
  /**
   * A `fetch` to hand to the Composio client. It resolves `globalThis.fetch`
   * on every call, so a spy installed after the client was built still
   * intercepts the request.
   */
  readonly fetch: typeof globalThis.fetch;
  readonly getMetrics: () => Effect.Effect<ClientMetrics>;
}

// Statuses whose response carries no body by definition. `new Response(body,
// init)` rejects a body for them, and there is nothing to count anyway.
const BODYLESS_STATUSES: ReadonlySet<number> = new Set([101, 204, 205, 304]);

const isRedirect = (response: Response): boolean => response.status >= 300 && response.status < 400;

/**
 * Builds a counting `fetch` wrapper plus a reader for its totals.
 *
 * The byte count comes from `Content-Length` when the server sends it, and
 * otherwise from a pass-through `TransformStream` over the body, so the body
 * is never buffered a second time.
 */
export const makeClientMetricsCollector = (): ClientMetricsCollector => {
  let requests = 0;
  let byteSize = 0;

  const countResponse = (response: Response): Response => {
    const contentLength = response.headers.get('content-length');
    if (contentLength !== null) {
      const parsed = Number.parseInt(contentLength, 10);
      if (parsed >= 0) {
        byteSize += parsed;
        return response;
      }
    }

    // A redirect is handed back untouched: the client inspects `type` and
    // `url` on it to decide whether following the hop is safe, and a rewrapped
    // response reports neither. Its body is discarded before the next hop, so
    // nothing is lost by not counting it.
    if (response.body === null || BODYLESS_STATUSES.has(response.status) || isRedirect(response)) {
      return response;
    }

    const counting = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        byteSize += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });

    return new Response(response.body.pipeThrough(counting), response);
  };

  const fetch: typeof globalThis.fetch = Object.assign(
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requests += 1;
      return globalThis.fetch(input, init).then(countResponse);
    },
    // Bun's `fetch` carries a `preconnect` helper; forward it so the wrapper
    // satisfies the same type.
    { preconnect: (url: string | URL) => globalThis.fetch.preconnect(url) }
  );

  return {
    fetch,
    getMetrics: () => Effect.sync(() => ({ byteSize, requests })),
  };
};
