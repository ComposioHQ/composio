import { describe, expect, it } from 'vitest';
import { Data } from 'effect';
import { extractErrorDetails } from 'src/effect-errors/logic/errors/extract-error-details';

class RequestError extends Data.TaggedError('RequestError')<{
  readonly message: string;
  readonly cause: unknown;
}> {}

describe('extractErrorDetails', () => {
  it('preserves a tagged error message when the error also has a cause', () => {
    const error = new RequestError({
      message: 'The request failed for /api/signup.',
      cause: new TypeError('fetch failed'),
    });

    expect(extractErrorDetails(error)).toStrictEqual({
      isPlainString: false,
      type: 'RequestError',
      message: 'The request failed for /api/signup.',
    });
  });
});
