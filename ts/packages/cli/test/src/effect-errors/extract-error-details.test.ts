import { describe, expect, it } from 'vitest';
import { Data } from 'effect';
import { extractErrorDetails } from 'src/effect-errors/logic/errors/extract-error-details';

class RequestError extends Data.TaggedError('RequestError')<{
  readonly message: string;
  readonly cause: unknown;
}> {}

describe('extractErrorDetails', () => {
  it('preserves a tagged error message and appends the cause detail', () => {
    const error = new RequestError({
      message: 'The request failed for /api/signup.',
      cause: new TypeError('fetch failed'),
    });

    expect(extractErrorDetails(error)).toStrictEqual({
      isPlainString: false,
      type: 'RequestError',
      message: 'The request failed for /api/signup.\nCaused by: fetch failed',
    });
  });

  it('surfaces the deepest cause message in a nested chain', () => {
    const deepest = new Error('expected NonEmptyString, got null');
    const middle = new Error('Failed to parse GitHub release JSON response', { cause: deepest });
    const error = new RequestError({
      message: 'Upgrade failed.',
      cause: middle,
    });

    expect(extractErrorDetails(error)).toStrictEqual({
      isPlainString: false,
      type: 'RequestError',
      message: 'Upgrade failed.\nCaused by: expected NonEmptyString, got null',
    });
  });

  it('leaves the message untouched when the cause carries no detail', () => {
    const error = new RequestError({
      message: 'The request failed.',
      cause: undefined,
    });

    expect(extractErrorDetails(error)).toStrictEqual({
      isPlainString: false,
      type: 'RequestError',
      message: 'The request failed.',
    });
  });

  it('does not repeat a cause message identical to the wrapper message', () => {
    const error = new RequestError({
      message: 'boom',
      cause: new Error('boom'),
    });

    expect(extractErrorDetails(error)).toStrictEqual({
      isPlainString: false,
      type: 'RequestError',
      message: 'boom',
    });
  });
});
