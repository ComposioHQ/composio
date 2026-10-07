import { describe, it, expect, vi, assert } from 'vitest';
import ComposioClient from '@composio/client';
import { Tools } from '../../src/models/Tools';
import { ToolRouterSession } from '../../src/models/ToolRouterSession';
import { SessionContextImpl } from '../../src/models/SessionContext';
import { ComposioToolInputRequiredError } from '../../src/errors';
import { MockProvider } from '../utils/mocks/provider.mock';

vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: { instrument: vi.fn() },
}));

// The execute and proxy-execute endpoints answer `result_type: "input_required"`
// when a call needs the user's input (an approval, for example) before it can
// run. That answer carries no data, log ID or HTTP status, so it cannot be
// returned as an execution result: every execution path raises it as a typed
// error that carries the questions and the opaque `request_state`.
//
// These tests run a real client against a stubbed `fetch` so they cover the
// wire shape the generated client hands to the SDK.

const SESSION_ID = 'sess_123';

const inputRequired = {
  result_type: 'input_required',
  input_requests: {
    approval_1: {
      type: 'elicitation',
      mode: 'form',
      message: 'Allow GMAIL_SEND_EMAIL to send this email?',
      requested_schema: {
        type: 'object',
        properties: { approved: { type: 'boolean' } },
        required: ['approved'],
      },
    },
  },
  request_state: 'opaque-state-token',
};

const createClient = (body: unknown) => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
  );
  const client = new ComposioClient({
    apiKey: 'test-api-key',
    baseURL: 'https://backend.invalid',
    fetch,
  });
  return { client, fetch };
};

const createSession = (client: ComposioClient) =>
  new ToolRouterSession(client, { apiKey: 'key', provider: new MockProvider() }, SESSION_ID, {
    type: 'http' as const,
    url: `https://backend.invalid/api/v3/tool_router/session/${SESSION_ID}`,
  });

const proxyParams = {
  toolkit: 'github',
  endpoint: 'https://api.github.com/user/repos?token=secret',
  method: 'POST' as const,
  body: { name: 'repo' },
};

const executionPaths: Array<{
  name: string;
  subject: string;
  run: (client: ComposioClient) => Promise<unknown>;
}> = [
  {
    name: 'provider-wrapped session tool',
    subject: 'Tool GMAIL_SEND_EMAIL',
    run: client =>
      new Tools(client, { provider: new MockProvider() }).executeSessionTool('GMAIL_SEND_EMAIL', {
        sessionId: SESSION_ID,
        arguments: { to: 'test@test.com' },
      }),
  },
  {
    name: 'session.execute',
    subject: 'Tool GMAIL_SEND_EMAIL',
    run: client => createSession(client).execute('GMAIL_SEND_EMAIL', { to: 'test@test.com' }),
  },
  {
    name: 'session.proxyExecute',
    subject: 'POST proxy call for toolkit github',
    run: client => createSession(client).proxyExecute(proxyParams),
  },
  {
    name: 'custom tool context execute',
    subject: 'Tool GMAIL_SEND_EMAIL',
    run: client =>
      new SessionContextImpl(client, 'test-user', SESSION_ID).execute('GMAIL_SEND_EMAIL', {
        to: 'test@test.com',
      }),
  },
  {
    name: 'custom tool context proxyExecute',
    subject: 'POST proxy call for toolkit github',
    run: client =>
      new SessionContextImpl(client, 'test-user', SESSION_ID).proxyExecute(proxyParams),
  },
];

describe('execution that requires user input', () => {
  it.each(executionPaths)(
    '$name raises ComposioToolInputRequiredError',
    async ({ run, subject }) => {
      const { client, fetch } = createClient(inputRequired);

      const error = await run(client).catch((caught: unknown) => caught);

      assert(error instanceof ComposioToolInputRequiredError);
      expect(error.code).toBe('TS-SDK::TOOL_INPUT_REQUIRED');
      expect(error.message).toContain(`${subject} requires user input`);
      expect(error.message).toContain('request_state');
      // The opaque state and the proxied URL stay out of the message.
      expect(error.message).not.toContain('opaque-state-token');
      expect(error.message).not.toContain('secret');
      expect(error.requestState).toBe('opaque-state-token');
      expect(error.inputRequests).toEqual({
        approval_1: {
          type: 'elicitation',
          mode: 'form',
          message: 'Allow GMAIL_SEND_EMAIL to send this email?',
          requestedSchema: {
            type: 'object',
            properties: { approved: { type: 'boolean' } },
            required: ['approved'],
          },
        },
      });
      // The call is not repeated: answering needs the user.
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('leaves requestState undefined when the API returns none', async () => {
    const { client } = createClient({ ...inputRequired, request_state: undefined });

    const error = await createSession(client)
      .execute('GMAIL_SEND_EMAIL', {})
      .catch((caught: unknown) => caught);

    assert(error instanceof ComposioToolInputRequiredError);
    expect(error.requestState).toBeUndefined();
  });

  it.each([
    { name: 'completed', result_type: 'completed' as const, error: null },
    { name: 'failed', result_type: 'failed' as const, error: 'Connection not found' },
  ])('session.execute still returns a $name result', async ({ result_type, error }) => {
    const { client } = createClient({ result_type, data: { id: 'msg_1' }, error, log_id: 'log_1' });

    await expect(createSession(client).execute('GMAIL_SEND_EMAIL', {})).resolves.toEqual({
      data: { id: 'msg_1' },
      error,
      logId: 'log_1',
      resultType: result_type,
    });
  });

  it('session.proxyExecute still returns a completed result', async () => {
    const { client } = createClient({
      result_type: 'completed',
      status: 201,
      data: { id: 1 },
      headers: { 'x-request-id': 'req_1' },
    });

    await expect(createSession(client).proxyExecute(proxyParams)).resolves.toEqual({
      status: 201,
      data: { id: 1 },
      headers: { 'x-request-id': 'req_1' },
    });
  });
});

// `result_type` says whether a tool that ran succeeded. A failed execution can
// carry a `null` or empty `error`, so success is read from `result_type` and
// only falls back to the error text when the API sent no `result_type`.
const executedAnswers: Array<{
  name: string;
  result_type?: 'completed' | 'failed';
  error: string | null;
  successful: boolean;
}> = [
  { name: 'failed with a null error', result_type: 'failed', error: null, successful: false },
  { name: 'failed with an empty error', result_type: 'failed', error: '', successful: false },
  { name: 'failed with a message', result_type: 'failed', error: 'Boom', successful: false },
  { name: 'completed', result_type: 'completed', error: null, successful: true },
  { name: 'no result_type and no error', error: null, successful: true },
  { name: 'no result_type and an error', error: 'Boom', successful: false },
];

const wireBody = ({ result_type, error }: (typeof executedAnswers)[number]) => ({
  ...(result_type !== undefined && { result_type }),
  data: {},
  error,
  log_id: 'log',
});

class TargetProvider extends MockProvider {
  executeFor(session: ToolRouterSession) {
    return this.executeToolForTarget(session, 'GMAIL_SEND_EMAIL', {});
  }
}

describe('session execution success', () => {
  it.each(executedAnswers)(
    'provider-wrapped session tool: $name is successful=$successful',
    async answer => {
      const { client } = createClient(wireBody(answer));

      const result = await new Tools(client, { provider: new MockProvider() }).executeSessionTool(
        'GMAIL_SEND_EMAIL',
        { sessionId: SESSION_ID, arguments: {} }
      );

      expect(result).toEqual({
        data: {},
        // The error is passed through as the API sent it.
        error: answer.error,
        successful: answer.successful,
        logId: 'log',
      });
    }
  );

  it.each(executedAnswers)(
    'provider tool call bound to a session: $name is successful=$successful',
    async answer => {
      const { client } = createClient(wireBody(answer));

      const result = await new TargetProvider().executeFor(createSession(client));

      expect(result.successful).toBe(answer.successful);
      expect(result.error).toBe(answer.error);
    }
  );

  it.each(executedAnswers)('session.execute: $name exposes resultType', async answer => {
    const { client } = createClient(wireBody(answer));

    const result = await createSession(client).execute('GMAIL_SEND_EMAIL', {});

    expect(result.resultType).toBe(answer.result_type);
    expect(result.error).toBe(answer.error);
  });

  it.each(executedAnswers)(
    'custom tool context execute: $name exposes resultType',
    async answer => {
      const { client } = createClient(wireBody(answer));

      const result = await new SessionContextImpl(client, 'test-user', SESSION_ID).execute(
        'GMAIL_SEND_EMAIL',
        {}
      );

      expect(result.resultType).toBe(answer.result_type);
      expect(result.error).toBe(answer.error);
    }
  );

  it('falls back to the error text when result_type is a value the SDK does not know', async () => {
    const { client } = createClient({
      result_type: 'deferred',
      data: {},
      error: null,
      log_id: 'l',
    });

    const result = await createSession(client).execute('GMAIL_SEND_EMAIL', {});

    expect(result.resultType).toBeUndefined();
  });
});
