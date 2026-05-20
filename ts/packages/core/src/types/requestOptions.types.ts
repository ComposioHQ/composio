/**
 * Per-request transport options for cancelling an SDK call.
 *
 * For `tools.get` and `tools.execute`, pass `signal` directly in the
 * options bag (3rd argument) alongside any modifiers or provider options.
 * For other methods (e.g. `toolkits.get`, `authConfigs.list`), pass as a
 * trailing argument. Forwarded to the underlying `@composio/client` request.
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
 * const controller = new AbortController();
 * const tools = await composio.tools.get(
 *   'user_123',
 *   { search: 'send email', limit: 50 },
 *   { signal: controller.signal }
 * );
 * ```
 *
 * @example Combine signal with modifiers
 * ```typescript
 * const result = await composio.tools.execute('TOOL', body, {
 *   signal: controller.signal,
 *   beforeExecute: ({ params }) => params,
 * });
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
