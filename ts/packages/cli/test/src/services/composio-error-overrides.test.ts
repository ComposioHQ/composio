import { describe, expect, it } from 'vitest';

import {
  ComposioNoActiveConnectionError,
  mapComposioError,
  mapOnlyComposioOverrideError,
} from 'src/services/composio-error-overrides';

describe('composio-error-overrides', () => {
  it('rewrites tool-router no-active-connection errors by toolkit', () => {
    const result = mapComposioError({
      toolkit: 'gmail',
      error: {
        details: {
          code: 4302,
          slug: 'ToolRouterV2_NoActiveConnection',
          message: 'No active connection',
        },
      },
    });

    expect(result.normalized).toBeInstanceOf(ComposioNoActiveConnectionError);
    expect(result.message).toBe(
      'No active connection found for toolkit "gmail". Run `composio link gmail`, then retry.'
    );
  });

  it('rewrites execute no-connection errors by tool slug', () => {
    const result = mapComposioError({
      toolSlug: 'SLACK_SEND_MESSAGE',
      error: {
        error: {
          slug: 'ActionExecute_ConnectedAccountNotFound',
          message: 'Missing connected account',
        },
      },
    });

    expect(result.normalized).toBeInstanceOf(ComposioNoActiveConnectionError);
    expect(result.message).toBe(
      'No active connection found for toolkit "slack". Run `composio link slack`, then retry.'
    );
  });

  it('passes through unrelated errors', () => {
    const error = new Error('Something else broke');

    const result = mapComposioError({ error });

    expect(result.normalized).toBe(error);
    expect(result.override).toBeNull();
    expect(result.message).toBe('Something else broke');
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
      error: {
        details: {
          code: 4302,
          slug: 'ToolRouterV2_NoActiveConnection',
        },
      },
    });

    expect(mapped).toBeInstanceOf(ComposioNoActiveConnectionError);
  });
});
