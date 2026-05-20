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
      throw new ComposioRequestCancelledError(undefined, {
        cause: error instanceof Error ? error : undefined,
      });
    }
    throw error;
  }
}
