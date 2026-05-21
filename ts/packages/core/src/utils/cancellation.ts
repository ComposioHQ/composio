import { ComposioRequestCancelledError, isRequestAbortError } from '../errors/SDKErrors';

/** @internal */
export async function withCancellation<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (isRequestAbortError(error)) {
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
