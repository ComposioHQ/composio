import { APIConnectionError, APIError } from '@composio/client';
import { describe, expect, it } from 'vitest';
import { extractApiErrorDetails, findApiError } from 'src/utils/api-error-extraction';

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

  it('returns undefined when no APIError is in the chain', () => {
    expect(extractApiErrorDetails({ error: envelope.error })).toBeUndefined();
    expect(extractApiErrorDetails(new Error('plain'))).toBeUndefined();
    expect(extractApiErrorDetails(undefined)).toBeUndefined();
    expect(extractApiErrorDetails('plain string')).toBeUndefined();
  });
});
