import type ComposioClient from '@composio/client';

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
 * @example Timeout after 5 seconds
 * ```typescript
 * await composio.tools.execute(
 *   'HACKERNEWS_GET_FRONTPAGE',
 *   { userId: 'default', arguments: {} },
 *   { signal: AbortSignal.timeout(5_000) }
 * );
 * ```
 *
 * @example Combine signal with modifiers
 * ```typescript
 * await composio.tools.execute('TOOL', body, {
 *   signal: AbortSignal.timeout(10_000),
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
  signal?: AbortSignal;
};

/**
 * The `@composio/client` per-request transport options, reached via a public
 * method whose only parameter is that type (`tools.retrieveEnum`). The
 * `internal/*` subpath that declares `RequestOptions` is not in the package's
 * `exports`, so we derive it structurally instead of deep-importing it.
 * @internal
 */
type ClientRequestOptions = NonNullable<Parameters<ComposioClient['tools']['retrieveEnum']>[0]>;

/**
 * Compile-time guards: {@link ComposioRequestOptions} is forwarded verbatim to
 * every `@composio/client` call, so it MUST stay a structural subset of the
 * client's request options. These constraints fail the build (TS2344) if a
 * field here is typed incompatibly with the client's same-named field, or if a
 * key is added that the client doesn't have — forcing the divergence to be
 * reconciled rather than discovered at runtime.
 * @internal
 */
type AssertValuesAssignable<_T extends ClientRequestOptions> = void;
type AssertKeysSubset<_K extends keyof ClientRequestOptions> = void;
type _RequestOptionsValuesStayCompatible = AssertValuesAssignable<ComposioRequestOptions>;
type _RequestOptionsKeysStaySubset = AssertKeysSubset<keyof ComposioRequestOptions>;
