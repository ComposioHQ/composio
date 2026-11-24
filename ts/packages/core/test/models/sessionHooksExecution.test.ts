import { describe, it, expect, vi } from 'vitest';
import ComposioClient, { Auth, createFetchTransport } from '@composio/client';
import { Tools } from '../../src/models/Tools';
import { ToolRouter } from '../../src/models/ToolRouter';
import { ToolRouterSession } from '../../src/models/ToolRouterSession';
import { SessionContextImpl } from '../../src/models/SessionContext';
import type { ToolRouterHook } from '../../src/types/toolRouter.types';
import { MockProvider } from '../utils/mocks/provider.mock';

vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: { instrument: vi.fn() },
}));

// A session hook can block a call before it runs, or block its result before
// the agent sees it. The API answers with `result_type: "blocked"`, which has
// no data and no HTTP response. These tests run a real client against a
// stubbed `fetch` so they cover the wire shape the SDK reads.

const SESSION_ID = 'sess_123';
const SESSION_PATH = '/api/v3.1/tool_router/session';

const blockedCall = {
  result_type: 'blocked',
  reason: { type: 'request_blocked', hook_id: 'no_external_email' },
  message: 'Blocked by session policy: No external email',
  log_id: '',
  hook_results: [{ id: 'no_external_email', status: 'evaluated', outcome: 'block' }],
};

const blockedResponse = {
  result_type: 'blocked',
  reason: { type: 'response_blocked', hook_id: 'no_outside_data' },
  message: 'Blocked by session policy',
  log_id: 'log_456',
  instant_charge: { amount: '0.01', currency: 'USD', charged_by: 'composio' },
  hook_results: [{ id: 'no_outside_data', status: 'evaluated', outcome: 'block' }],
};

const { log_id: _logId, ...blockedProxy } = blockedCall;

const createClient = (body: unknown) => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
  );
  const client = new ComposioClient({
    auth: Auth.project('test-api-key'),
    baseURL: 'https://backend.invalid',
    transport: createFetchTransport({ fetch }),
  });
  return { client, fetch };
};

const createSession = (client: ComposioClient) =>
  new ToolRouterSession(client, { apiKey: 'key', provider: new MockProvider() }, SESSION_ID, {
    type: 'http' as const,
    url: `https://backend.invalid/api/v3/tool_router/session/${SESSION_ID}`,
  });

const proxyParams = {
  toolkit: 'gmail',
  endpoint: '/gmail/v1/users/me/messages/send',
  method: 'POST' as const,
  body: { raw: 'VG86IGNlb0ByaXZhbC5jb20' },
};

describe('webhook session hook configuration', () => {
  it.each([
    {
      name: 'sessions.create',
      method: 'POST',
      path: SESSION_PATH,
      run: (client: ComposioClient, hooks: ToolRouterHook[]) =>
        new ToolRouter(client).create('test-user', { hooks }),
    },
    {
      name: 'session.update',
      method: 'PATCH',
      path: `${SESSION_PATH}/${SESSION_ID}`,
      run: (client: ComposioClient, hooks: ToolRouterHook[]) =>
        createSession(client).update({ hooks }),
    },
  ])('$name serializes webhook handlers for both hook phases', async ({ method, path, run }) => {
    const { client, fetch } = createClient({
      session_id: SESSION_ID,
      config_version: 1,
      config: { user_id: 'test-user', preload: { tools: [] } },
      tool_router_tools: [],
      mcp: { type: 'http', url: `https://backend.invalid${SESSION_PATH}/${SESSION_ID}` },
    });

    await run(client, [
      {
        type: 'before_execute',
        id: 'check_outgoing_email',
        appliesTo: { toolkits: ['gmail'] },
        handler: { type: 'webhook', fallbackAction: 'block', timeoutMs: 2000 },
      },
      {
        type: 'after_execute',
        id: 'redact_results',
        appliesTo: 'all',
        handler: { type: 'webhook', fallbackAction: 'continue' },
      },
    ]);

    expect(fetch).toHaveBeenCalledTimes(1);
    const request = new Request(...fetch.mock.calls[0]);
    expect(request.method).toBe(method);
    expect(new URL(request.url).pathname).toBe(path);
    expect(await request.json()).toHaveProperty('hooks', [
      {
        type: 'before_execute',
        id: 'check_outgoing_email',
        applies_to: { toolkits: ['gmail'] },
        handler: { type: 'webhook', fallback_action: 'block', timeout_ms: 2000 },
      },
      {
        type: 'after_execute',
        id: 'redact_results',
        applies_to: 'all',
        handler: { type: 'webhook', fallback_action: 'continue' },
      },
    ]);
  });
});

const executePaths = [
  {
    name: 'session.execute',
    run: (client: ComposioClient, args: Record<string, unknown>) =>
      createSession(client).execute('GMAIL_SEND_EMAIL', args),
  },
  {
    name: 'custom tool context execute',
    run: (client: ComposioClient, args: Record<string, unknown>) =>
      new SessionContextImpl(client, 'test-user', SESSION_ID).execute('GMAIL_SEND_EMAIL', args),
  },
];

describe('session execute when a hook blocks the call', () => {
  it.each(executePaths)(
    '$name returns resultType blocked with the message in error',
    async ({ run }) => {
      const { client } = createClient(blockedCall);

      await expect(run(client, { to: 'ceo@rival.com' })).resolves.toEqual({
        data: {},
        error: 'Blocked by session policy: No external email',
        logId: '',
        resultType: 'blocked',
        blockReason: { type: 'request_blocked', hookId: 'no_external_email' },
        hookResults: [{ id: 'no_external_email', status: 'evaluated', outcome: 'block' }],
      });
    }
  );

  it('keeps the log id and the charge when the tool ran and its result was blocked', async () => {
    const { client } = createClient(blockedResponse);

    await expect(createSession(client).execute('GMAIL_FETCH_EMAILS', {})).resolves.toEqual({
      data: {},
      error: 'Blocked by session policy',
      logId: 'log_456',
      resultType: 'blocked',
      blockReason: { type: 'response_blocked', hookId: 'no_outside_data' },
      hookResults: [{ id: 'no_outside_data', status: 'evaluated', outcome: 'block' }],
      instantCharge: { amount: '0.01', currency: 'USD', charged_by: 'composio' },
    });
  });

  // Every provider hands the agent `{ data, error, successful }`, so this is
  // what the agent sees in any framework.
  it('reaches the agent as a failed call with the hook message', async () => {
    const { client } = createClient(blockedCall);

    const result = await new Tools(client, { provider: new MockProvider() }).executeSessionTool(
      'GMAIL_SEND_EMAIL',
      { sessionId: SESSION_ID, arguments: { to: 'ceo@rival.com' } }
    );

    expect(result).toEqual({
      data: {},
      error: 'Blocked by session policy: No external email',
      successful: false,
      logId: '',
    });
  });

  it('returns the hook results of a call that ran', async () => {
    const { client } = createClient({
      result_type: 'completed',
      data: { id: 'msg_1' },
      error: null,
      log_id: 'log_1',
      hook_results: [
        { id: 'no_external_email', status: 'evaluated', outcome: 'continue' },
        { id: 'block_injection', status: 'unavailable' },
      ],
    });

    // A hook that could not be evaluated does not block: the call still ran.
    await expect(createSession(client).execute('GMAIL_SEND_EMAIL', {})).resolves.toEqual({
      data: { id: 'msg_1' },
      error: null,
      logId: 'log_1',
      resultType: 'completed',
      hookResults: [
        { id: 'no_external_email', status: 'evaluated', outcome: 'continue' },
        { id: 'block_injection', status: 'unavailable' },
      ],
    });
  });

  it.each(executePaths)('$name says why a webhook hook was unavailable', async ({ run }) => {
    const { client } = createClient({
      result_type: 'blocked',
      reason: { type: 'request_blocked', hook_id: 'check_outgoing_email' },
      message: 'Blocked by session policy',
      log_id: '',
      hook_results: [
        {
          id: 'check_outgoing_email',
          status: 'unavailable',
          detail: 'The webhook endpoint timed out',
        },
      ],
    });

    await expect(run(client, {})).resolves.toMatchObject({
      resultType: 'blocked',
      hookResults: [
        {
          id: 'check_outgoing_email',
          status: 'unavailable',
          detail: 'The webhook endpoint timed out',
        },
      ],
    });
  });

  it('leaves hookResults out of a blocked call that reports none', async () => {
    const { hook_results: _hookResults, ...withoutHookResults } = blockedCall;
    const { client } = createClient(withoutHookResults);

    await expect(createSession(client).execute('GMAIL_SEND_EMAIL', {})).resolves.not.toHaveProperty(
      'hookResults'
    );
  });
});

describe('session proxy execute when a hook blocks the request', () => {
  it.each([
    {
      name: 'session.proxyExecute',
      run: (client: ComposioClient) => createSession(client).proxyExecute(proxyParams),
    },
    {
      name: 'custom tool context proxyExecute',
      run: (client: ComposioClient) =>
        new SessionContextImpl(client, 'test-user', SESSION_ID).proxyExecute(proxyParams),
    },
  ])('$name returns resultType blocked with no HTTP response', async ({ run }) => {
    const { client } = createClient(blockedProxy);

    await expect(run(client)).resolves.toEqual({
      resultType: 'blocked',
      blockReason: { type: 'request_blocked', hookId: 'no_external_email' },
      message: 'Blocked by session policy: No external email',
      hookResults: [{ id: 'no_external_email', status: 'evaluated', outcome: 'block' }],
    });
  });

  it('marks a request that was sent as completed', async () => {
    const { client } = createClient({
      result_type: 'completed',
      status: 200,
      data: { id: 'msg_1' },
      headers: { 'content-type': 'application/json' },
    });

    await expect(createSession(client).proxyExecute(proxyParams)).resolves.toEqual({
      resultType: 'completed',
      status: 200,
      data: { id: 'msg_1' },
      headers: { 'content-type': 'application/json' },
    });
  });

  it('returns the hook results of a request that was sent', async () => {
    const hookResults = [{ id: 'no_external_email', status: 'evaluated', outcome: 'continue' }];
    const { client } = createClient({
      result_type: 'completed',
      status: 200,
      data: { id: 'msg_1' },
      hook_results: hookResults,
    });

    await expect(createSession(client).proxyExecute(proxyParams)).resolves.toMatchObject({
      resultType: 'completed',
      hookResults,
    });
  });
});
