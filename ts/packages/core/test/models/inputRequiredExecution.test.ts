import { describe, it, expect, vi, assert } from 'vitest';
import ComposioClient from '@composio/client';
import { z } from 'zod/v3';
import { Tools } from '../../src/models/Tools';
import { ToolRouterSession } from '../../src/models/ToolRouterSession';
import { SessionContextImpl } from '../../src/models/SessionContext';
import { inspect, format } from 'node:util';
import { ComposioError, ComposioToolInputRequiredError, ValidationError } from '../../src/errors';
import logger from '../../src/utils/logger';
import { buildCustomToolsMap, createCustomTool } from '../../src/models/CustomTool';
import type { CustomToolsMap, SessionContext } from '../../src/types/customTool.types';
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

  // `request_state` is continuation state. It stays readable for the code that
  // answers the request and out of everything an error is routinely dumped into.
  it('keeps requestState out of inspection, serialization and pretty printing', async () => {
    const { client } = createClient(inputRequired);
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const error = await createSession(client)
      .execute('GMAIL_SEND_EMAIL', {})
      .catch((caught: unknown) => caught);

    assert(error instanceof ComposioToolInputRequiredError);
    expect(error.requestState).toBe('opaque-state-token');

    const inspected = inspect(error, { depth: null });
    expect(inspected).toContain('ComposioToolInputRequiredError');
    expect(inspected).toContain('approval_1');
    expect(inspected).not.toContain('opaque-state-token');
    // The message names the property; the property itself is not printed.
    expect(inspected).not.toMatch(/requestState:/);
    // What `console.error(error)` writes.
    expect(format(error)).not.toContain('opaque-state-token');

    const serialized = JSON.stringify(error);
    expect(serialized).toContain('approval_1');
    expect(serialized).not.toContain('opaque-state-token');
    expect(JSON.parse(serialized)).not.toHaveProperty('requestState');

    expect(Object.keys(error)).not.toContain('requestState');
    expect({ ...error }).not.toHaveProperty('requestState');

    error.prettyPrint(true);
    ComposioError.handle(error, { includeStack: true });
    expect(logged).toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).not.toContain('opaque-state-token');
    logged.mockRestore();
  });

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

// A local custom tool reaches the API through the `ctx.execute()` and
// `ctx.proxyExecute()` helpers. The wrapper that runs the tool turns whatever
// it throws into a failed result, which must not happen to an input request:
// the caller needs the questions and the request state, not a message.
const customToolCalling = (call: (ctx: SessionContext) => Promise<unknown>) =>
  buildCustomToolsMap([
    createCustomTool('SEND_WELCOME_EMAIL', {
      name: 'Send welcome email',
      description: 'Sends the welcome email through a session helper',
      inputParams: z.object({}),
      execute: async (_input, ctx) => ({ sent: await call(ctx) }),
    }),
  ]);

const enclosingToolBodies: Array<{
  name: string;
  subject: string;
  call: (ctx: SessionContext) => Promise<unknown>;
}> = [
  {
    name: 'ctx.execute()',
    subject: 'Tool GMAIL_SEND_EMAIL',
    call: ctx => ctx.execute('GMAIL_SEND_EMAIL', { to: 'test@test.com' }),
  },
  {
    name: 'ctx.proxyExecute()',
    subject: 'POST proxy call for toolkit github',
    call: ctx => ctx.proxyExecute(proxyParams),
  },
];

const createSessionWithCustomTools = (client: ComposioClient, customToolsMap: CustomToolsMap) =>
  new ToolRouterSession(
    client,
    { apiKey: 'key', provider: new MockProvider() },
    SESSION_ID,
    {
      type: 'http' as const,
      url: `https://backend.invalid/api/v3/tool_router/session/${SESSION_ID}`,
    },
    undefined,
    customToolsMap,
    'test-user'
  );

describe('custom tool whose body requires user input', () => {
  it.each(enclosingToolBodies)(
    'session.execute of a custom tool calling $name raises ComposioToolInputRequiredError',
    async ({ call, subject }) => {
      const { client, fetch } = createClient(inputRequired);
      const session = createSessionWithCustomTools(client, customToolCalling(call));

      const error = await session
        .execute('SEND_WELCOME_EMAIL', {})
        .catch((caught: unknown) => caught);

      assert(error instanceof ComposioToolInputRequiredError);
      expect(error.message).toContain(`${subject} requires user input`);
      expect(error.requestState).toBe('opaque-state-token');
      expect(Object.keys(error.inputRequests)).toEqual(['approval_1']);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it.each(enclosingToolBodies)(
    'a sibling custom tool calling $name raises through ctx.execute()',
    async ({ call }) => {
      const { client } = createClient(inputRequired);
      const context = new SessionContextImpl(
        client,
        'test-user',
        SESSION_ID,
        customToolCalling(call)
      );

      const error = await context
        .execute('SEND_WELCOME_EMAIL', {})
        .catch((caught: unknown) => caught);

      assert(error instanceof ComposioToolInputRequiredError);
      expect(error.requestState).toBe('opaque-state-token');
    }
  );

  it('still turns any other error thrown by the tool into a failed result', async () => {
    const { client } = createClient(inputRequired);
    const session = createSessionWithCustomTools(
      client,
      customToolCalling(async () => {
        throw new Error('boom');
      })
    );

    await expect(session.execute('SEND_WELCOME_EMAIL', {})).resolves.toEqual({
      data: {},
      error: 'boom',
      logId: '',
      resultType: 'failed',
    });
  });
});

// `result_type` says whether a tool that ran succeeded. A failed execution can
// carry a `null` or empty `error`, so success is read from `result_type` alone.
const executedAnswers: Array<{
  name: string;
  result_type: 'completed' | 'failed';
  error: string | null;
  successful: boolean;
}> = [
  { name: 'failed with a null error', result_type: 'failed', error: null, successful: false },
  { name: 'failed with an empty error', result_type: 'failed', error: '', successful: false },
  { name: 'failed with a message', result_type: 'failed', error: 'Boom', successful: false },
  { name: 'completed', result_type: 'completed', error: null, successful: true },
];

const wireBody = ({ result_type, error }: (typeof executedAnswers)[number]) => ({
  result_type,
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
});

// Every session execute answer carries a `result_type`. One without it, or with
// a value this SDK does not know, is not a result: reading it as a success or
// as a failure would be a guess, so each path raises instead.
const invalidAnswers = [
  { name: 'no result_type', body: { data: {}, error: null, log_id: 'log' } },
  {
    name: 'an unknown result_type',
    body: { result_type: 'deferred', data: {}, error: null, log_id: 'log' },
  },
];

const executePaths = executionPaths.filter(path => !path.name.includes('proxyExecute'));

describe.each(invalidAnswers)('session execute answer with $name', ({ body }) => {
  it.each(executePaths)('$name raises ValidationError', async ({ run }) => {
    const { client, fetch } = createClient(body);

    const error = await run(client).catch((caught: unknown) => caught);

    assert(error instanceof ValidationError);
    expect(error.message).toContain(
      'Tool GMAIL_SEND_EMAIL returned an execute response without a known result_type'
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('provider tool call bound to a session raises ValidationError', async () => {
    const { client } = createClient(body);

    await expect(new TargetProvider().executeFor(createSession(client))).rejects.toBeInstanceOf(
      ValidationError
    );
  });
});
