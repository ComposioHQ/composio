/**
 * Per-request transport options for cancelling an SDK call.
 *
 * Passed as a trailing argument to public SDK methods (e.g.
 * `composio.tools.execute`, `composio.tools.get`, `composio.toolkits.list`)
 * and forwarded to the underlying `@composio/client` request. Use this when
 * a single call must be cancellable independently of any global timeout —
 * long-running searches, user-cancellable jobs, or server-side aborts.
 *
 * If the underlying request is aborted via this signal, the SDK throws a
 * {@link ComposioRequestCancelledError} so callers can `instanceof`-detect
 * cancellation without unwrapping nested causes.
 *
 * @example Cancel an in-flight tool execution
 * ```typescript
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 5_000);
 *
 * try {
 *   await composio.tools.execute(
 *     'HACKERNEWS_GET_FRONTPAGE',
 *     { userId: 'default', arguments: {} },
 *     undefined,
 *     { signal: controller.signal }
 *   );
 * } catch (err) {
 *   if (err instanceof ComposioRequestCancelledError) {
 *     // caller-initiated cancellation
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @example Cancel a slow search
 * ```typescript
 * // The provider-options arg (3rd) stays `undefined`; `requestOptions` is the
 * // trailing 4th positional argument on `tools.get`.
 * const controller = new AbortController();
 * const tools = await composio.tools.get(
 *   'user_123',
 *   { search: 'send email', limit: 50 },
 *   undefined,
 *   { signal: controller.signal }
 * );
 * ```
 */
export type ComposioRequestOptions = {
  /**
   * An `AbortSignal` used to cancel the in-flight HTTP request. When the
   * signal aborts, the underlying fetch is aborted and the SDK throws a
   * {@link ComposioRequestCancelledError} (subclass of {@link ComposioError}).
   */
  signal?: AbortSignal | null;
};
