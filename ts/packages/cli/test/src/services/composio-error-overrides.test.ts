import { describe, expect, it } from 'vitest';

import {
  ComposioNoActiveConnectionError,
  ComposioRevokedConnectionError,
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

  // A revoked grant arrives as a successful call whose body carries the provider's own error
  // string. There is no Composio code, slug, or status to key on, and the connected account still
  // reads ACTIVE — the provider's wording is the only evidence there is.
  describe('provider-side authorization failures', () => {
    it('classifies a revoked token from the provider error string alone', () => {
      const result = mapComposioError({
        toolSlug: 'SLACK_LIST_ALL_CHANNELS',
        error: 'Slack API error: token_revoked',
      });

      expect(result.normalized).toBeInstanceOf(ComposioRevokedConnectionError);
      expect(result.override?.kind).toBe('revoked_connection');
      expect(result.message).toBe(
        'The slack connection is no longer authorized (Slack API error: token_revoked). Reconnect it, then retry.'
      );
    });

    it.each([
      ['invalid_auth', 'Slack API error: invalid_auth'],
      ['invalid_grant', '{"error":"invalid_grant","error_description":"Token expired"}'],
      ['GitHub prose', 'Bad credentials'],
      ['Google prose', 'Token has been expired or revoked.'],
    ])('classifies %s', (_label, message) => {
      const result = mapComposioError({ toolkit: 'gmail', error: message });

      expect(result.override?.kind).toBe('revoked_connection');
    });

    it.each([
      ['a tool that talks about revoked records', 'Returned 3 revoked certificates'],
      ['a field named like a code', 'Missing required parameter: invalid_tokens_filter'],
      ['an unrelated failure', 'Rate limit exceeded'],
    ])('leaves %s unclassified', (_label, message) => {
      const result = mapComposioError({ toolkit: 'gmail', error: message });

      expect(result.override).toBeNull();
      expect(result.message).toBe(message);
    });

    it('lets Composio-side no-connection win over provider wording', () => {
      const result = mapComposioError({
        toolkit: 'slack',
        error: {
          details: {
            code: 4302,
            slug: 'ToolRouterV2_NoActiveConnection',
            message: 'No active connection, previous token_revoked',
          },
        },
      });

      expect(result.normalized).toBeInstanceOf(ComposioNoActiveConnectionError);
      expect(result.override?.kind).toBe('no_active_connection');
    });

    it('falls back to a toolkit-free message when the slug names no toolkit', () => {
      const result = mapComposioError({ toolSlug: 'COMPOSIO_SEARCH_TOOLS', error: 'not_authed' });

      expect(result.message).toBe(
        'The connection for this tool call is no longer authorized (not_authed). Reconnect the toolkit, then retry.'
      );
    });
  });

  it('passes through unrelated errors', () => {
    const error = new Error('Something else broke');

    const result = mapComposioError({ error });

    expect(result.normalized).toBe(error);
    expect(result.override).toBeNull();
    expect(result.message).toBe('Something else broke');
  });

  it('does not trust malformed API error fields but keeps the valid ones', () => {
    const error = {
      details: {
        code: '4302',
        slug: 4302,
        message: 'Malformed API error',
      },
    };

    const result = mapComposioError({ error });

    expect(result.normalized).toBe(error);
    expect(result.apiDetails?.message).toBe('Malformed API error');
    expect(result.apiDetails?.code).toBeUndefined();
    expect(result.apiDetails?.slug).toBeUndefined();
    expect(result.override).toBeNull();
    expect(result.message).toBe('Malformed API error');
  });

  it('skips UnknownException wrappers while decoding their causes', () => {
    const result = mapComposioError({
      toolkit: 'gmail',
      error: {
        _tag: 'UnknownException',
        cause: {
          code: 4302,
          slug: 'ToolRouterV2_NoActiveConnection',
          message: 'No active connection',
        },
      },
    });

    expect(result.normalized).toBeInstanceOf(ComposioNoActiveConnectionError);
    expect(result.apiDetails).toEqual({
      code: 4302,
      slug: 'ToolRouterV2_NoActiveConnection',
      message: 'No active connection',
    });
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
