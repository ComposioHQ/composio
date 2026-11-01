import { BadRequestError, InternalServerError } from '@composio/client/effect';
import { describe, expect, it } from 'vitest';

import {
  ComposioNoActiveConnectionError,
  mapComposioError,
  mapOnlyComposioOverrideError,
} from 'src/services/composio-error-overrides';

const url = 'https://backend.composio.dev/api/v3.1/tools/execute/{tool_slug}';

// The client's error for a 400 answered with `envelope`.
const apiError = (envelope: { code: number; slug: string; message: string }) => {
  const details = { status: 400, ...envelope };
  return new BadRequestError({
    message: `400 ${JSON.stringify({ error: details })}`,
    method: 'POST',
    url,
    status: 400,
    requestId: 'req_test',
    details,
    body: { error: details },
  });
};

describe('composio-error-overrides', () => {
  it('rewrites a 4302 API error by toolkit', () => {
    const result = mapComposioError({
      toolkit: 'gmail',
      error: apiError({
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
      error: apiError({
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
        cause: apiError({
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
    const error = new InternalServerError({
      message: '502 {"message":"Bad gateway"}',
      method: 'POST',
      url,
      status: 502,
      requestId: 'req_test',
      details: undefined,
      body: { message: 'Bad gateway' },
    });

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
      error: apiError({
        code: 4302,
        slug: 'ToolRouterV2_NoActiveConnection',
        message: 'No active connection',
      }),
    });

    expect(mapped).toBeInstanceOf(ComposioNoActiveConnectionError);
  });

  it('keeps an unrelated API error unmapped, with the envelope message', () => {
    const error = apiError({
      code: 1803,
      slug: 'Tool_NotFound',
      message: 'Tool not found',
    });

    const result = mapComposioError({ error });

    expect(result.override).toBeNull();
    expect(result.normalized).toBe(error);
    expect(result.message).toBe('Tool not found');
    expect(mapOnlyComposioOverrideError({ error })).toBe(error);
  });
});
