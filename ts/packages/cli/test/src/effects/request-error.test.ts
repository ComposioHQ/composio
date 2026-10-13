import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { extractErrorDetails } from 'src/effect-errors/logic/errors/extract-error-details';
import { failedWith, requestError } from 'src/effects/request-error';

class WidgetsRequestError extends requestError('commands/WidgetsRequestError') {}

describe('requestError', () => {
  it('names the error by its tag and keeps the message and the cause', () => {
    const cause = new TypeError('fetch failed');
    const error = new WidgetsRequestError({ message: 'Failed to list widgets.', cause });

    expect(error).toBeInstanceOf(Error);
    expect(error._tag).toBe('commands/WidgetsRequestError');
    expect(error.name).toBe('commands/WidgetsRequestError');
    expect(error.message).toBe('Failed to list widgets.');
    expect(error.cause).toBe(cause);
    expect(extractErrorDetails(error)).toStrictEqual({
      isPlainString: false,
      type: 'commands/WidgetsRequestError',
      message: 'Failed to list widgets.\nCaused by: fetch failed',
    });
  });
});

describe('failedWith', () => {
  it.effect('replaces a failure with the error, keeping the failure as its cause', () =>
    Effect.gen(function* () {
      const cause = new TypeError('fetch failed');

      const error = yield* Effect.fail(cause).pipe(
        failedWith(WidgetsRequestError, 'Failed to list widgets.'),
        Effect.flip
      );

      expect(error).toBeInstanceOf(WidgetsRequestError);
      expect(error.message).toBe('Failed to list widgets.');
      expect(error.cause).toBe(cause);
    })
  );

  it.effect('recovers by the tag of the error it raised', () =>
    Effect.gen(function* () {
      const recovered = yield* Effect.fail('unreachable').pipe(
        failedWith(WidgetsRequestError, 'Failed to list widgets.'),
        Effect.catchTag('commands/WidgetsRequestError', error => Effect.succeed(error.message))
      );

      expect(recovered).toBe('Failed to list widgets.');
    })
  );

  it.effect('leaves a success as it is', () =>
    Effect.gen(function* () {
      const value = yield* Effect.succeed(42).pipe(
        failedWith(WidgetsRequestError, 'Failed to list widgets.')
      );

      expect(value).toBe(42);
    })
  );
});
