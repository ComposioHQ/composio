import logger from './logger';

/**
 * Describes a thrown or rejected value for a log line without ever throwing.
 *
 * The logger serializes object arguments with `JSON.stringify`, which turns an `Error` into `{}`
 * and throws on a circular value, so callers log this string instead of the raw value.
 * `JSON.stringify` and `String()` can both throw (a circular value, an object without a
 * prototype), so each is tried in turn.
 */
export function describeThrown(value: unknown): string {
  try {
    if (value instanceof Error) return value.message;
    if (typeof value === 'object' && value !== null) return JSON.stringify(value) ?? String(value);
    return String(value);
  } catch {
    try {
      return String(value);
    } catch {
      return '[unprintable value]';
    }
  }
}

/**
 * Calls a user-supplied event callback so that neither a synchronous throw nor a rejected promise
 * escapes into the event emitter that invoked it. Failures are logged after `label`.
 *
 * pusher-js does not catch listener exceptions, and nothing awaits the promise an `async`
 * listener returns, so an escaped failure would end a Node process.
 */
export function invokeUserCallback(label: string, callback: () => unknown): void {
  const logFailure = (error: unknown) => {
    logger.error(label, describeThrown(error));
  };
  try {
    Promise.resolve(callback()).catch(logFailure);
  } catch (error) {
    logFailure(error);
  }
}
