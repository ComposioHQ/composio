import { ComposioRequestCancelledError, isRequestAbortError } from '../errors/SDKErrors';

/** @internal */
export async function withCancellation<T>(
  call: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (signal?.aborted && isRequestAbortError(error)) {
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
