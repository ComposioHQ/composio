import { describe, expect, it } from 'vitest';

import { extractErrorDetails } from './extract-error-details';

describe('extractErrorDetails function', () => {
  it('should handle plain strings', () => {
    const error = 'Oh no';

    const result = extractErrorDetails(error);

    expect(result).toStrictEqual({ isPlainString: true, message: error });
  });

  it('should handle errors with cause', () => {
    const _tag = 'MyError';
    const message = 'Oh no!';
    const cause = 'Some cause';

    class MyError extends Error {
      constructor(message: string, cause: string) {
        super(message, { cause });
      }

      public _tag = _tag;
    }
    const error = new MyError(message, cause);

    const result = extractErrorDetails(error);

    expect(result).toStrictEqual({
      isPlainString: false,
      message: cause,
      type: _tag,
    });
  });

  it('should handle errors with Error ctor', () => {
    const message = 'Oh no!';
    const cause = 'Some cause';

    class MyError extends Error {
      constructor(message: string, cause: string) {
        super(message, { cause });
      }
    }
    const error = new MyError(message, cause);

    const result = extractErrorDetails(error);

    expect(result).toStrictEqual({
      isPlainString: false,
      message: [message],
      type: 'Error',
    });
  });

  it('should handle plain objects with tag attribute', () => {
    const error = {
      _tag: 'MyError',
      message: 'Oh no!',
    };

    const result = extractErrorDetails(error);

    expect(result).toStrictEqual({
      isPlainString: false,
      message: error.message,
      type: error._tag,
    });
  });

  it('should handle plain objects with toString impl', () => {
    const errorType = 'MyError';
    const error = {
      message: 'Oh no!',
      toString: () => `${errorType}: Oh no!`,
    };

    const result = extractErrorDetails(error);

    expect(result).toStrictEqual({
      isPlainString: false,
      message: [error.message],
      type: errorType,
    });
  });

  it('should handle plain objects with toString impl and underlying type', () => {
    const errorTypeWithUnderlyingType = 'MyError: Sucks to be you';
    const error = {
      message: 'Oh no!',
      toString: () => `${errorTypeWithUnderlyingType}: Oh no!`,
    };

    const result = extractErrorDetails(error);

    const [errorType, message] = errorTypeWithUnderlyingType.split(': ');

    expect(result).toStrictEqual({
      isPlainString: false,
      message: [message, error.message],
      type: errorType,
    });
  });
});
