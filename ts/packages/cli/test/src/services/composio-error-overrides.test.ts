import { APIError } from '@composio/client';
import { describe, expect, it } from 'vitest';

import {
  ComposioNoActiveConnectionError,
  mapComposioError,
  mapOnlyComposioOverrideError,
} from 'src/services/composio-error-overrides';

const apiError = (
  status: number,
  envelope: { code: number; slug: string; message: string } | Record<string, unknown>
) =>
  APIError.generate(
    status,
    'code' in envelope ? { error: { status, ...envelope } } : envelope,
    undefined,
    new Headers({ 'x-request-id': 'req_test' })
  );

describe('composio-error-overrides', () => {
  it('rewrites a 4302 API error by toolkit', () => {
    const result = mapComposioError({
      toolkit: 'gmail',
      error: apiError(400, {
        code: 4302,
        slug: 'SomethingElse',
        message: 'No active connection',
      }),
    });

    expect(result.normalized).toBeInstanceOf(ComposioNoActiveConnectionError);
    expect(result.message).toBe(
      'No active connection found for toolkit "gmail". Run `composio link gmail`, then retry.'
    );
    expect(result.apiDetails).toMatchObject({ code: 4302, status: 400, request_id: 'req_test' });
  });

  it('rewrites an execute no-connection slug by tool slug', () => {
    const result = mapComposioError({
      toolSlug: 'SLACK_SEND_MESSAGE',
      error: apiError(400, {
        code: 1,
        slug: 'ActionExecute_ConnectedAccountNotFound',
        message: 'Missing connected account',
      }),
    });

    expect(result.normalized).toBeInstanceOf(ComposioNoActiveConnectionError);
    expect(result.message).toBe(
      'No active connection found for toolkit "slack". Run `composio link slack`, then retry.'
    );
  });

  it('still recognizes an API error wrapped in an Effect cause chain', () => {
    const result = mapComposioError({
      toolkit: 'gmail',
      error: {
        _tag: 'UnknownException',
        cause: apiError(400, {
          code: 1,
          slug: 'ToolRouterV2_NoActiveConnection',
          message: 'No active connection',
        }),
      },
    });

    expect(result.normalized).toBeInstanceOf(ComposioNoActiveConnectionError);
    expect(result.slugValue).toBe('ToolRouterV2_NoActiveConnection');
  });

  it('passes through unrelated errors', () => {
    const error = new Error('boom');

    const result = mapComposioError({ error });

    expect(result.normalized).toBe(error);
    expect(result.override).toBeNull();
    expect(result.message).toBe('boom');
  });

  it('keeps a non-envelope API error unmapped, with the error message', () => {
    const error = apiError(502, { message: 'Bad gateway' });

    const result = mapComposioError({ error });

    expect(result.override).toBeNull();
    expect(result.apiDetails).toMatchObject({ status: 502, code: undefined, slug: undefined });
    expect(result.message).toBe(error.message);
  });

  it('does not classify look-alike plain objects as API errors', () => {
    const error = {
      details: {
        code: 4302,
        slug: 'ToolRouterV2_NoActiveConnection',
        message: 'Looks like an API error',
      },
    };

    const result = mapComposioError({ toolkit: 'gmail', error });

    expect(result.override).toBeNull();
    expect(result.apiDetails).toBeUndefined();
  });

  it('preserves original generic errors for top-level CLI handling', () => {
    const error = {
      _tag: 'ToolExecutionError',
      error: new Error('inner'),
    };

    expect(mapOnlyComposioOverrideError({ error })).toBe(error);
  });

  it('still rewrites override-class Composio errors at the top level', () => {
    const mapped = mapOnlyComposioOverrideError({
      toolkit: 'gmail',
      error: apiError(400, {
        code: 4302,
        slug: 'ToolRouterV2_NoActiveConnection',
        message: 'No active connection',
      }),
    });

    expect(mapped).toBeInstanceOf(ComposioNoActiveConnectionError);
  });
});
