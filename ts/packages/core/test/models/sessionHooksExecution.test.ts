import { describe, it, expect, vi } from 'vitest';
import ComposioClient, { Auth, createFetchTransport } from '@composio/client';
import { Tools } from '../../src/models/Tools';
import { ToolRouterSession } from '../../src/models/ToolRouterSession';
import { SessionContextImpl } from '../../src/models/SessionContext';
import { MockProvider } from '../utils/mocks/provider.mock';

vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: { instrument: vi.fn() },
}));

// A session hook can block a call before it runs, or block its result before
// the agent sees it. The API answers with `result_type: "blocked"`, which has
// no data and no HTTP response. These tests run a real client against a
// stubbed `fetch` so they cover the wire shape the SDK reads.

const SESSION_ID = 'sess_123';

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

describe('session execute when a hook blocks the call', () => {
  it.each([
    {
      name: 'session.execute',
      run: (client: ComposioClient) =>
        createSession(client).execute('GMAIL_SEND_EMAIL', { to: 'ceo@rival.com' }),
    },
    {
      name: 'custom tool context execute',
      run: (client: ComposioClient) =>
        new SessionContextImpl(client, 'test-user', SESSION_ID).execute('GMAIL_SEND_EMAIL', {
          to: 'ceo@rival.com',
        }),
    },
  ])('$name returns resultType blocked with the message in error', async ({ run }) => {
    const { client } = createClient(blockedCall);

    await expect(run(client)).resolves.toEqual({
      data: {},
      error: 'Blocked by session policy: No external email',
      logId: '',
      resultType: 'blocked',
      blockReason: { type: 'request_blocked', hookId: 'no_external_email' },
      hookResults: [{ id: 'no_external_email', status: 'evaluated', outcome: 'block' }],
    });
  });

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
