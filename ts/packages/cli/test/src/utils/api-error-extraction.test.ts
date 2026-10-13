import {
  APIConnectionError,
  DecodeError,
  InternalServerError,
  RateLimitError,
} from '@composio/client/effect';
import { describe, expect, it } from 'vitest';
import {
  extractApiErrorDetails,
  extractMessage,
  findApiError,
} from 'src/utils/api-error-extraction';

const envelope = {
  error: {
    message: 'Rate limited',
    code: 42901,
    slug: 'rate_limited',
    status: 429,
    request_id: 'req_body',
    suggested_fix: 'Slow down',
  },
};

const url = 'https://backend.composio.dev/api/v3.1/toolkits';

// The client's error for a 429 answered with `envelope`.
const rateLimitError = (requestId: string | undefined) =>
  new RateLimitError({
    message: `429 ${JSON.stringify(envelope)}`,
    method: 'GET',
    url,
    status: 429,
    requestId: requestId ?? envelope.error.request_id,
    details: envelope.error,
    body: envelope,
  });

const badGatewayError = (body: unknown, message: string) =>
  new InternalServerError({
    message,
    method: 'GET',
    url,
    status: 502,
    requestId: undefined,
    details: undefined,
    body,
  });

const connectionError = (description: string) =>
  new APIConnectionError({
    message: 'Connection error.',
    method: 'GET',
    url,
    reason: 'TransportError',
    description,
  });

describe('extractApiErrorDetails', () => {
  it('reads the envelope, status, and header request id from a status error', () => {
    const error = rateLimitError('req_header');

    expect(findApiError(error)).toBe(error);
    expect(extractApiErrorDetails(error)).toEqual({
      message: 'Rate limited',
      code: 42901,
      slug: 'rate_limited',
      status: 429,
      request_id: 'req_header',
      suggested_fix: 'Slow down',
    });
  });

  it('follows the cause chain to the first status error', () => {
    const error = rateLimitError(undefined);
    const wrapper = Object.assign(new Error('generic wrapper'), {
      cause: { _tag: 'UnknownException', cause: error },
    });

    expect(findApiError(wrapper)).toBe(error);
    expect(extractApiErrorDetails(wrapper)?.slug).toBe('rate_limited');
  });

  it('falls back to the error message when the body is not the envelope', () => {
    const error = badGatewayError({ message: 'Bad gateway' }, '502 {"message":"Bad gateway"}');

    expect(extractApiErrorDetails(error)).toMatchObject({
      message: error.message,
      status: 502,
      code: undefined,
      slug: undefined,
    });
  });

  it('falls back to the status-prefixed message when the body is not JSON', () => {
    const error = badGatewayError(undefined, '502 status code (no body)');

    expect(extractApiErrorDetails(error)).toEqual({
      message: '502 status code (no body)',
      code: undefined,
      slug: undefined,
      status: 502,
      request_id: undefined,
      suggested_fix: undefined,
    });
  });

  it('reports no details for a connection error', () => {
    expect(extractApiErrorDetails(connectionError('fetch failed'))).toBeUndefined();
  });

  it('returns undefined when no status error is in the chain', () => {
    expect(extractApiErrorDetails({ error: envelope.error })).toBeUndefined();
    expect(extractApiErrorDetails(new Error('plain'))).toBeUndefined();
    expect(extractApiErrorDetails(undefined)).toBeUndefined();
    expect(extractApiErrorDetails('plain string')).toBeUndefined();
  });
});

describe('extractMessage', () => {
  it('reads the envelope message', () => {
    expect(extractMessage(rateLimitError(undefined))).toBe('Rate limited');
  });

  it('reads the message of a body that is not the envelope', () => {
    const error = badGatewayError({ message: 'Bad gateway' }, '502 {"message":"Bad gateway"}');

    expect(extractMessage(error)).toBe('Bad gateway');
  });

  it('reports a response that failed decoding by operation and request id, with the remedy', () => {
    const clientError = new DecodeError({
      message: "The response body does not match the schema of 'toolRouter.session.toolkits'.",
      method: 'GET',
      url: 'https://backend.composio.dev/api/v3.1/tool_router/session/{session_id}/toolkits',
      status: 200,
      requestId: 'req_toolkits',
      operation: 'toolRouter.session.toolkits',
      issues: [{ path: ['items', 0, 'slug'], kind: 'MissingKey' }],
    });

    expect(extractMessage({ cause: clientError })).toBe(
      "The API response for 'toolRouter.session.toolkits' is not in the shape this version of the CLI expects (request id: req_toolkits).\nUpgrade the CLI, then retry:\n> composio upgrade"
    );
  });

  it('reads the transport text of a connection error', () => {
    const error = connectionError('fetch failed: connect ECONNREFUSED 127.0.0.1:1');

    expect(extractMessage(error)).toBe('fetch failed: connect ECONNREFUSED 127.0.0.1:1');
  });

  it('falls back to the status-prefixed message when the body is not JSON', () => {
    const error = badGatewayError(undefined, '502 status code (no body)');

    expect(extractMessage(error)).toBe('502 status code (no body)');
  });
});
