import {
  APIConnectionError as ClientAPIConnectionError,
  APIConnectionTimeoutError as ClientAPIConnectionTimeoutError,
  DecodeError as ClientDecodeError,
  NotFoundError as ClientNotFoundError,
} from '@composio/client/effect';
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

const notFoundEnvelope = {
  error: {
    message: 'Toolkit not found',
    code: 1803,
    slug: 'Toolkit_NotFound',
    status: 404,
    request_id: 'req_body',
    suggested_fix: 'Check the toolkit slug',
  },
};

const notFoundDetail =
  '404 {"error":{"message":"Toolkit not found","code":1803,"slug":"Toolkit_NotFound","status":404,"request_id":"req_body","suggested_fix":"Check the toolkit slug"}}';

describe('extractErrorDetails for an uncaught API failure', () => {
  describe('raised as a client error', () => {
    const url = 'https://backend.composio.dev/api/v3.1/toolkits/{slug}';

    it('shows the same cause detail for a 404, under the client tag', () => {
      const error = new ClientNotFoundError({
        message: notFoundDetail,
        method: 'GET',
        url,
        status: 404,
        requestId: 'req_header',
        details: notFoundEnvelope.error,
        body: notFoundEnvelope,
      });

      expect(extractErrorDetails(error)).toStrictEqual({
        isPlainString: false,
        type: '@composio/client/NotFoundError',
        message: `\nCaused by: ${notFoundDetail}`,
      });
    });

    it('shows the transport reason of a connection failure', () => {
      const error = new ClientAPIConnectionError({
        message: 'Connection error.',
        method: 'GET',
        url,
        reason: 'TransportError',
        description: 'fetch failed: connect ECONNREFUSED 127.0.0.1:1',
      });

      expect(extractErrorDetails(error).message).toBe(
        '\nCaused by: fetch failed: connect ECONNREFUSED 127.0.0.1:1'
      );
    });

    it('shows the message of a connection failure the transport did not describe', () => {
      const error = new ClientAPIConnectionError({
        message: 'Too many redirects.',
        method: 'GET',
        url,
        reason: 'TooManyRedirects',
        description: undefined,
      });

      expect(extractErrorDetails(error).message).toBe('\nCaused by: Too many redirects.');
    });

    it('shows a timeout', () => {
      const error = new ClientAPIConnectionTimeoutError({
        message: 'Request timed out.',
        method: 'GET',
        url,
      });

      expect(extractErrorDetails(error).message).toBe('\nCaused by: Request timed out.');
    });

    it('names the operation and request id of a decode failure and suggests an upgrade', () => {
      const error = new ClientDecodeError({
        message: "The response body does not match the schema of 'toolkits.retrieve'.",
        method: 'GET',
        url,
        status: 200,
        requestId: 'req_decode',
        operation: 'toolkits.retrieve',
        issues: [{ path: ['meta', 'categories'], kind: 'InvalidType' }],
      });

      expect(extractErrorDetails(error)).toStrictEqual({
        isPlainString: false,
        type: '@composio/client/DecodeError',
        message:
          "The API response for 'toolkits.retrieve' is not in the shape this version of the CLI expects (request id: req_decode).\nUpgrade the CLI, then retry:\n> composio upgrade",
      });
    });
  });

  describe('raised as a command error wrapping a client error', () => {
    const url = 'https://backend.composio.dev/api/v3.1/internal/action_execution/logs';

    it('shows the transport reason of a connection failure', () => {
      const error = new RequestError({
        message: 'Failed to fetch tool logs.',
        cause: new ClientAPIConnectionError({
          message: 'Connection error.',
          method: 'POST',
          url,
          reason: 'TransportError',
          description: 'fetch failed: connect ECONNREFUSED 127.0.0.1:1',
        }),
      });

      expect(extractErrorDetails(error).message).toBe(
        'Failed to fetch tool logs.\nCaused by: fetch failed: connect ECONNREFUSED 127.0.0.1:1'
      );
    });

    it('names the operation and request id of a decode failure and suggests an upgrade', () => {
      const error = new RequestError({
        message: 'Failed to fetch tool logs.',
        cause: new ClientDecodeError({
          message: "The response body does not match the schema of 'logs.tools.list'.",
          method: 'POST',
          url,
          status: 200,
          requestId: 'req_logs',
          operation: 'logs.tools.list',
          issues: [{ path: ['data', 0, 'status'], kind: 'InvalidValue' }],
        }),
      });

      expect(extractErrorDetails(error).message).toBe(
        "Failed to fetch tool logs.\nCaused by: The API response for 'logs.tools.list' is not in the shape this version of the CLI expects (request id: req_logs).\nUpgrade the CLI, then retry:\n> composio upgrade"
      );
    });
  });
});
