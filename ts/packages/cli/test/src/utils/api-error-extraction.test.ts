import { APIConnectionError, APIError } from '@composio/client';
import {
  APIConnectionError as ClientAPIConnectionError,
  InternalServerError as ClientInternalServerError,
  RateLimitError as ClientRateLimitError,
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

// The client error the Effect client fails with for the response behind `error`.
const clientRateLimitError = (error: APIError) =>
  new ClientRateLimitError({
    message: error.message,
    method: 'GET',
    url: 'https://backend.composio.dev/api/v3.1/toolkits',
    status: 429,
    requestId: error.requestId,
    details: error.details,
    body: error.error,
  });

const clientBadGatewayError = (body: unknown, message: string) =>
  new ClientInternalServerError({
    message,
    method: 'GET',
    url: 'https://backend.composio.dev/api/v3.1/toolkits',
    status: 502,
    requestId: undefined,
    details: undefined,
    body,
  });

describe('extractApiErrorDetails', () => {
  it('reads the envelope, status, and header request id from an APIError', () => {
    const error = APIError.generate(
      429,
      envelope,
      undefined,
      new Headers({ 'x-request-id': 'req_header' })
    );

    expect(extractApiErrorDetails(error)).toEqual({
      message: 'Rate limited',
      code: 42901,
      slug: 'rate_limited',
      status: 429,
      request_id: 'req_header',
      suggested_fix: 'Slow down',
    });
  });

  it('follows the cause chain to the first APIError', () => {
    const error = APIError.generate(429, envelope, undefined, new Headers());
    const wrapper = Object.assign(new Error('generic wrapper'), {
      cause: { _tag: 'UnknownException', cause: error },
    });

    expect(findApiError(wrapper)).toBe(error);
    expect(extractApiErrorDetails(wrapper)?.slug).toBe('rate_limited');
  });

  it('falls back to the error message when the body is not the envelope', () => {
    const error = APIError.generate(502, { message: 'Bad gateway' }, undefined, new Headers());

    expect(extractApiErrorDetails(error)).toMatchObject({
      message: error.message,
      status: 502,
      code: undefined,
      slug: undefined,
    });
  });

  it('reports a connection error without a status', () => {
    const details = extractApiErrorDetails(new APIConnectionError({ message: 'offline' }));

    expect(details?.status).toBeUndefined();
    expect(details?.message).toBe('offline');
  });

  it('reads the same details from a client error as from the equivalent APIError', () => {
    const error = APIError.generate(
      429,
      envelope,
      undefined,
      new Headers({ 'x-request-id': 'req_header' })
    );
    const clientError = clientRateLimitError(error);

    expect(findApiError(clientError)).toBe(clientError);
    expect(extractApiErrorDetails(clientError)).toEqual(extractApiErrorDetails(error));
    expect(extractApiErrorDetails(clientError)).toEqual({
      message: 'Rate limited',
      code: 42901,
      slug: 'rate_limited',
      status: 429,
      request_id: 'req_header',
      suggested_fix: 'Slow down',
    });
  });

  it('falls back to the status-prefixed message of a client error without a JSON body', () => {
    const clientError = clientBadGatewayError(undefined, '502 status code (no body)');

    expect(extractApiErrorDetails(clientError)).toEqual({
      message: '502 status code (no body)',
      code: undefined,
      slug: undefined,
      status: 502,
      request_id: undefined,
      suggested_fix: undefined,
    });
  });

  it('reports no details for a client connection error', () => {
    const clientError = new ClientAPIConnectionError({
      message: 'Connection error.',
      method: 'GET',
      url: 'https://backend.composio.dev/api/v3.1/toolkits',
      reason: 'TransportError',
      description: 'fetch failed',
    });

    expect(extractApiErrorDetails(clientError)).toBeUndefined();
  });

  it('returns undefined when no APIError is in the chain', () => {
    expect(extractApiErrorDetails({ error: envelope.error })).toBeUndefined();
    expect(extractApiErrorDetails(new Error('plain'))).toBeUndefined();
    expect(extractApiErrorDetails(undefined)).toBeUndefined();
    expect(extractApiErrorDetails('plain string')).toBeUndefined();
  });
});

describe('extractMessage', () => {
  it('reads the envelope message from an APIError', () => {
    const error = APIError.generate(429, envelope, undefined, new Headers());

    expect(extractMessage(error)).toBe('Rate limited');
  });

  it('reads the message of a body that is not the envelope', () => {
    const error = APIError.generate(502, { message: 'Bad gateway' }, undefined, new Headers());

    expect(extractMessage(error)).toBe('Bad gateway');
  });

  it('falls back to the status-prefixed message when there is no body', () => {
    const error = APIError.generate(502, undefined, undefined, new Headers());

    expect(extractMessage(error)).toBe('502 status code (no body)');
  });
});

describe('extractMessage for a client error', () => {
  it('reads the envelope message', () => {
    const error = APIError.generate(429, envelope, undefined, new Headers());

    expect(extractMessage(clientRateLimitError(error))).toBe('Rate limited');
  });

  it('reads the message of a body that is not the envelope', () => {
    const clientError = clientBadGatewayError(
      { message: 'Bad gateway' },
      '502 {"message":"Bad gateway"}'
    );

    expect(extractMessage(clientError)).toBe('Bad gateway');
  });

  it('reads the transport text of a connection error', () => {
    const clientError = new ClientAPIConnectionError({
      message: 'Connection error.',
      method: 'GET',
      url: 'https://backend.composio.dev/api/v3.1/toolkits',
      reason: 'TransportError',
      description: 'fetch failed: connect ECONNREFUSED 127.0.0.1:1',
    });

    expect(extractMessage(clientError)).toBe('fetch failed: connect ECONNREFUSED 127.0.0.1:1');
  });

  it('falls back to the status-prefixed message when the body is not JSON', () => {
    const clientError = clientBadGatewayError(undefined, '502 status code (no body)');

    expect(extractMessage(clientError)).toBe('502 status code (no body)');
  });
});
