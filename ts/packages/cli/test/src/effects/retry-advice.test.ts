import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  BadRequestError,
  ConflictError,
  DecodeError,
  InternalServerError,
  RateLimitError,
  type APIErrorFields,
} from '@composio/client/effect';
import { describe, expect, it } from '@effect/vitest';
import { Option } from 'effect';
import { requestError } from 'src/effects/request-error';
import { retryAdviceFor } from 'src/effects/retry-advice';
import { DashboardToolExecutionError } from 'src/services/dashboard-tool-execution';

const url = 'https://backend.composio.dev/api/v3.1/tools/{tool_slug}';

const status = (method: string, code: number): APIErrorFields => ({
  message: `${code}`,
  method,
  url,
  status: code,
  requestId: undefined,
  details: undefined,
  body: undefined,
});

const connectionError = (method: string, reason = 'TransportError') =>
  new APIConnectionError({
    message: 'Connection error.',
    method,
    url,
    reason,
    description: undefined,
  });

const timeout = (method: string) =>
  new APIConnectionTimeoutError({ message: 'Request timed out.', method, url });

class WrappingError extends requestError('test/WrappingError') {}

describe('retryAdviceFor', () => {
  it.each([
    { name: 'a GET that timed out', error: timeout('GET'), advice: 'safe' },
    { name: 'a GET whose connection failed', error: connectionError('GET'), advice: 'safe' },
    {
      name: 'a GET answered 503',
      error: new InternalServerError(status('GET', 503)),
      advice: 'safe',
    },
    {
      name: 'a DELETE answered 502',
      error: new InternalServerError(status('DELETE', 502)),
      advice: 'safe',
    },
    { name: 'a GET answered 408', error: new APIError(status('GET', 408)), advice: 'safe' },
    { name: 'a POST answered 429', error: new RateLimitError(status('POST', 429)), advice: 'safe' },
    { name: 'a POST that timed out', error: timeout('POST'), advice: 'check-first' },
    {
      name: 'a POST whose connection failed',
      error: connectionError('POST'),
      advice: 'check-first',
    },
    {
      name: 'a PATCH answered 500',
      error: new InternalServerError(status('PATCH', 500)),
      advice: 'check-first',
    },
  ])('[Given] $name [Then] the advice is $advice', ({ error, advice }) => {
    expect(retryAdviceFor(error)).toStrictEqual(Option.some(advice));
  });

  it.each([
    { name: 'a 400', error: new BadRequestError(status('GET', 400)) },
    { name: 'a 409', error: new ConflictError(status('GET', 409)) },
    {
      name: 'a read whose response failed decoding',
      error: new DecodeError({
        message: 'The response body is not valid JSON.',
        method: 'GET',
        url,
        status: 200,
        requestId: undefined,
        operation: 'tools.retrieve',
        issues: [],
      }),
    },
    { name: 'a redirect the client refused', error: connectionError('GET', 'TooManyRedirects') },
    { name: 'an error that is not a request', error: new Error('boom') },
  ])('[Given] $name [Then] there is no advice', ({ error }) => {
    expect(retryAdviceFor(error)).toStrictEqual(Option.none());
  });

  it('[Given] an execution whose response failed decoding [Then] it may have run', () => {
    const error = new DecodeError({
      message: 'The response body is not valid JSON.',
      method: 'POST',
      url,
      status: 200,
      requestId: undefined,
      operation: 'toolRouter.session.execute',
      issues: [],
    });

    expect(retryAdviceFor(error)).toStrictEqual(Option.some('check-first'));
  });

  it('[Given] a command error that keeps the request failure as its cause [Then] it reads the cause', () => {
    const wrapped = new WrappingError({ message: 'Failed to fetch.', cause: timeout('GET') });

    expect(retryAdviceFor(wrapped)).toStrictEqual(Option.some('safe'));
  });

  it.each([
    { reason: 'request', status: undefined, advice: Option.some('check-first') },
    { reason: 'timeout', status: undefined, advice: Option.some('check-first') },
    { reason: 'response', status: 503, advice: Option.some('check-first') },
    { reason: 'response', status: 429, advice: Option.some('safe') },
    { reason: 'dashboard', status: 429, advice: Option.some('safe') },
    { reason: 'dashboard', status: 500, advice: Option.some('check-first') },
    { reason: 'dashboard', status: 400, advice: Option.none() },
    { reason: 'unauthorized', status: 401, advice: Option.none() },
  ] as const)(
    '[Given] a Dashboard execution that failed with $reason ($status) [Then] the advice is $advice',
    ({ reason, status: httpStatus, advice }) => {
      const error = new DashboardToolExecutionError({
        reason,
        message: 'failed',
        ...(httpStatus === undefined ? {} : { status: httpStatus }),
      });

      expect(retryAdviceFor(error)).toStrictEqual(advice);
    }
  );
});
