import { ComposioRequestCancelledError, isRequestAbortError } from '../errors/SDKErrors';

/** @internal */
export async function withCancellation<T>(
  call: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    // A raw `fetch` rejects with the signal's reason, so an `AbortSignal.timeout()`
    // surfaces as a `TimeoutError` (or a custom reason passed to `abort()`) that is
    // not abort-shaped. Matching the reason itself still excludes an unrelated
    // failure that merely coincides with a late abort.
    if (signal?.aborted && (isRequestAbortError(error) || error === signal.reason)) {
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
