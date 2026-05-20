/**
 * Per-request transport options for cancelling or time-bounding an SDK call.
 *
 * Passed as a trailing argument to public SDK methods (e.g.
 * `composio.tools.execute`, `composio.tools.get`, `composio.toolkits.list`)
 * and forwarded to the underlying `@composio/client` request. Use these when
 * a single call must be cancellable or bounded independently of the client
 * default timeout — long-running searches, user-cancellable jobs, or
 * server-side aborts.
 *
 * @example Cancel an in-flight tool execution
 * ```typescript
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 5_000);
 *
 * const result = await composio.tools.execute(
 *   'HACKERNEWS_GET_FRONTPAGE',
 *   { userId: 'default', arguments: {} },
 *   undefined,
 *   { signal: controller.signal }
 * );
 * ```
 *
 * @example Cap a search at 10 seconds
 * ```typescript
 * // The provider-options arg (3rd) stays `undefined`; `requestOptions` is the
 * // trailing 4th positional argument on `tools.get`.
 * const tools = await composio.tools.get(
 *   'user_123',
 *   { search: 'send email', limit: 50 },
 *   undefined,
 *   { timeout: 10_000 }
 * );
 * ```
 */
export type ComposioRequestOptions = {
  /**
   * An `AbortSignal` used to cancel the in-flight HTTP request. When the
   * signal aborts, the underlying fetch is aborted and the promise rejects
   * with an `AbortError` (or `APIUserAbortError` from `@composio/client`).
   */
  signal?: AbortSignal | null;
  /**
   * Maximum time in milliseconds the client will wait for a response from
   * the server before timing out a single request. Overrides the client-
   * level default (60 seconds) for this call only.
   *
   * @unit milliseconds
   */
  timeout?: number;
};
