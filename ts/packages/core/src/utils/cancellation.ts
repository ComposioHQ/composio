import { ComposioRequestCancelledError, isRequestAbortError } from '../errors/SDKErrors';

/**
 * Await a `@composio/client` API call and translate any abort error into a
 * typed {@link ComposioRequestCancelledError}. All other failures are
 * re-thrown unchanged so callers' existing error-handling stays valid.
 *
 * Public SDK methods that accept `ComposioRequestOptions` (and therefore
 * a caller `AbortSignal`) should route their underlying client call through
 * this helper so callers can `instanceof`-detect cancellation regardless of
 * whether the abort happened during a fetch, while parsing, or inside a
 * follow-up retry.
 *
 * @internal
 */
export async function withCancellation<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (isRequestAbortError(error)) {
      // Carry the underlying abort's message forward when present so the
      // wrapped error logs the original transport reason (e.g. "The
      // operation was aborted"); fall back to the constructor default
      // otherwise. Passing `undefined` would also trigger the default in
      // JS, but being explicit is clearer and immune to future refactors.
      const underlyingMessage = error instanceof Error ? error.message : '';
      const message = underlyingMessage
        ? `Request was cancelled by the caller: ${underlyingMessage}`
        : 'Request was cancelled by the caller';
      throw new ComposioRequestCancelledError(message, {
        cause: error instanceof Error ? error : undefined,
      });
    }
    throw error;
  }
}
