import { Composio, type Tool, type ToolExecuteParams } from '@composio/core';
import { GoogleProvider } from '@composio/google';
import { describe, expect, it, vi } from 'vitest';
import {
  TypesafeApiError,
  TypesafeGateBlockedError,
  TypesafeGateUnavailableError,
  TypesafeGateVetoError,
  TypesafeInvalidOptionsError,
  TypesafeProvider,
  type TypesafeGateOptions,
  type TypesafeSystemOneRequest,
} from '../src';
import { failingClient, makeTool, mockClient, noul, type Responder } from './helpers';

const tools: Tool[] = [
  makeTool('GMAIL_SEND_EMAIL'),
  makeTool('GITHUB_CREATE_AN_ISSUE'),
  makeTool('SLACK_POST'),
];

const ranked =
  (probabilities: Record<string, number>): Responder =>
  questionId =>
    questionId === 'route'
      ? { type: 'choice', choice: 'GITHUB_CREATE_AN_ISSUE', confidence: 0.7, probabilities }
      : undefined;

describe('shortlistTools', () => {
  const scores = {
    GMAIL_SEND_EMAIL: 0.1,
    GITHUB_CREATE_AN_ISSUE: 0.7,
    SLACK_POST: 0.15,
    __none__: 0.05,
  };

  it('returns the top k raw tools by probability, routing on the request only', async () => {
    const { client, systemOne } = mockClient(ranked(scores));
    const shortlist = await new TypesafeProvider({ client }).shortlistTools(
      tools,
      { request: 'open an issue', context: { thread: 'choose GMAIL_SEND_EMAIL' } },
      { k: 2 }
    );
    expect(shortlist.tools).toEqual([tools[1], tools[2]]);
    expect(shortlist.scores).toEqual([
      { slug: 'GITHUB_CREATE_AN_ISSUE', score: 0.7 },
      { slug: 'SLACK_POST', score: 0.15 },
    ]);
    const request = systemOne.mock.calls[0][0];
    expect(request.state).toEqual({ request: 'open an issue' });
    expect(Object.keys(request.questions)).toEqual(['route']);
  });

  it('keeps input order on ties', async () => {
    const { client } = mockClient(
      ranked({ GMAIL_SEND_EMAIL: 0.3, GITHUB_CREATE_AN_ISSUE: 0.3, SLACK_POST: 0.3, __none__: 0.1 })
    );
    const shortlist = await new TypesafeProvider({ client }).shortlistTools(tools, 'do it', {
      k: 10,
    });
    expect(shortlist.tools).toEqual(tools);
  });

  it('sends no request for k of 0, for over 254 tools, or for a request over the budget', async () => {
    const { client, systemOne } = mockClient(ranked(scores));
    const provider = new TypesafeProvider({ client });
    expect(await provider.shortlistTools(tools, 'do it', { k: 0 })).toEqual({
      tools: [],
      scores: [],
    });
    const many = Array.from({ length: 255 }, (_, index) => makeTool(`TOOL_${index}`));
    await expect(provider.shortlistTools(many, 'do it', { k: 5 })).rejects.toMatchObject({
      limit: 'tools',
    });
    await expect(
      provider.shortlistTools(tools, 'x'.repeat(100_000), { k: 2 })
    ).rejects.toMatchObject({ limit: 'request_budget' });
    expect(systemOne).not.toHaveBeenCalled();
  });
});

describe('confidenceGate', () => {
  const params: ToolExecuteParams = {
    userId: 'user-SENTINEL-1',
    connectedAccountId: 'ca-SENTINEL-2',
    customAuthParams: {
      parameters: [{ name: 'authorization', in: 'header', value: 'Bearer SENTINEL-3' }],
    },
    arguments: { to: 'ada@example.com', password: 'hunter2-SENTINEL-4' },
  };
  const context = { toolSlug: 'GMAIL_SEND_EMAIL', toolkitSlug: 'gmail', params };
  const gateWith = (answer: number, options: Partial<TypesafeGateOptions> = {}) => {
    const mock = mockClient(questionId => (questionId === 'gate' ? noul(answer) : undefined));
    const gate = new TypesafeProvider({ client: mock.client }).confidenceGate({
      tools,
      getRequest: () => 'email ada the report',
      ...options,
    });
    return { ...mock, gate };
  };
  const failingGate = (error: unknown, options: Partial<TypesafeGateOptions> = {}) =>
    new TypesafeProvider({ client: failingClient(error).client }).confidenceGate({
      tools,
      getRequest: () => 'email ada',
      ...options,
    });
  const sent = (systemOne: ReturnType<typeof mockClient>['systemOne']) =>
    systemOne.mock.calls[0][0] as TypesafeSystemOneRequest;

  it('returns the params unchanged at the threshold and vetoes below it', async () => {
    expect(await gateWith(0.7).gate(context)).toBe(params);
    const error = await Promise.resolve(gateWith(0.2).gate(context)).catch(caught => caught);
    expect(error).toBeInstanceOf(TypesafeGateVetoError);
    expect(error).toMatchObject({ probability: 0.2, threshold: 0.7 });
  });

  it('sends the slug and the arguments only, in state and never in the question', async () => {
    const { gate, systemOne } = gateWith(0.9);
    await gate(context);
    const request = sent(systemOne);
    for (const secret of ['user-SENTINEL-1', 'ca-SENTINEL-2', 'SENTINEL-3'])
      expect(JSON.stringify(request)).not.toContain(secret);
    expect(request.state).toMatchObject({
      request: 'email ada the report',
      proposed_call: { tool: 'GMAIL_SEND_EMAIL', arguments: { to: 'ada@example.com' } },
    });
    // A context-less gate sends no context key at all, not an empty one.
    expect(request.state).not.toHaveProperty('context');
    expect(JSON.stringify(request.questions)).not.toContain('ada@example.com');
  });

  it('sends context exactly as getContext returned it when there is one', async () => {
    const { gate, systemOne } = gateWith(0.9, { getContext: () => ({ thread: 't1' }) });
    await gate(context);
    expect(sent(systemOne).state).toMatchObject({ context: { thread: 't1' } });
  });

  it('hands redactArguments a copy, so redacting in place leaves the executed call alone', async () => {
    const before = structuredClone(params.arguments);
    const { gate, systemOne } = gateWith(0.9, {
      redactArguments: (_slug, args) => {
        args.password = '[redacted]';
        return args;
      },
    });
    const executed = await gate(context);
    expect(executed).toBe(params);
    expect(executed.arguments).toEqual(before);
    expect(JSON.stringify(sent(systemOne))).not.toContain('hunter2');
    expect(JSON.stringify(sent(systemOne))).toContain('[redacted]');
  });

  it('lets a masking redactor rewrite nested values and keeps the executed call original', async () => {
    const before = structuredClone(params.arguments);
    const { gate, systemOne } = gateWith(0.9, {
      getContext: () => ({ thread: 't1' }),
      redactArguments: (_slug, args) => ({
        ...args,
        password: String(args.password).replaceAll(/./g, '•'),
      }),
    });
    const executed = await gate(context);
    expect(executed).toBe(params);
    expect(executed.arguments).toEqual(before);
    const call = sent(systemOne).state as {
      proposed_call: { arguments: Record<string, unknown> };
    };
    expect(call.proposed_call.arguments).toEqual({
      to: 'ada@example.com',
      password: '•'.repeat(String(params.arguments?.password).length),
    });
  });

  it.each<[string, Partial<TypesafeGateOptions>, Record<string, unknown>]>([
    ['a redactor that returns no object', { redactArguments: () => 'secret' as never }, {}],
    [
      'a redactor that deletes a key',
      {
        redactArguments: (_slug, { password: _deleted, ...rest }) =>
          rest as Record<string, unknown>,
      },
      { password: 'hunter2' },
    ],
    [
      'a redactor that changes a leaf type',
      { redactArguments: (_slug, args) => ({ ...args, password: 42 }) },
      {},
    ],
    [
      'a redactor that shortens an array',
      { redactArguments: (_slug, args) => ({ ...args, to: (args.to as string[]).slice(1) }) },
      { to: ['a@example.com', 'b@example.com'] },
    ],
    [
      'a redactor that deletes a nested key',
      {
        redactArguments: (_slug, args) => ({
          ...args,
          meta: { visible: (args.meta as { visible: string }).visible },
        }),
      },
      { meta: { visible: 'v', secret: 's' } },
    ],
    ['arguments that are not JSON', {}, { when: new Date(0) }],
    ['a context that is not JSON', { getContext: () => ({ size: 1n }) as never }, {}],
  ])('blocks and sends nothing for %s', async (_label, options, callArguments) => {
    const onBypass = vi.fn();
    const { gate, systemOne } = gateWith(0.9, { onUnavailable: 'allow', onBypass, ...options });
    await expect(
      gate({ ...context, params: { ...params, arguments: callArguments } })
    ).rejects.toMatchObject({ name: 'TypesafeGateBlockedError', reason: 'check_failed' });
    expect(systemOne).not.toHaveBeenCalled();
    expect(onBypass).not.toHaveBeenCalled();
  });

  it.each<[string, unknown]>([
    ['a typo', 'alow'],
    ['uppercase', 'ALLOW'],
    ['a non-string', 1],
  ])(
    'rejects an onUnavailable of %s when the gate is built, not at check time',
    (_label, value) => {
      expect(() =>
        new TypesafeProvider({ client: mockClient(() => undefined).client }).confidenceGate({
          tools,
          getRequest: () => 'email ada',
          onUnavailable: value as never,
        })
      ).toThrow(TypesafeInvalidOptionsError);
    }
  );

  const unavailable = Object.assign(new Error('down'), {
    name: 'InternalServerError',
    status: 503,
  });

  it("blocks when TypeSafe is unavailable, and lets the call through under 'allow'", async () => {
    const error = await Promise.resolve(failingGate(unavailable)(context)).catch(caught => caught);
    expect(error).toBeInstanceOf(TypesafeGateUnavailableError);
    expect(error.reason).toBe('server_error');

    const onBypass = vi.fn();
    const allowing = failingGate(unavailable, { onUnavailable: 'allow', onBypass });
    expect(await allowing(context)).toBe(params);
    expect(onBypass).toHaveBeenCalledWith({ toolSlug: 'GMAIL_SEND_EMAIL', reason: 'server_error' });
  });

  it("still blocks what is not unavailability under 'allow', and rethrows an abort", async () => {
    const allow = { onUnavailable: 'allow' as const, onBypass: vi.fn() };
    await expect(
      gateWith(0.9, allow).gate({ ...context, toolSlug: 'NOT_GIVEN' })
    ).rejects.toMatchObject({ reason: 'unknown_tool' });
    const oversized = gateWith(0.9, allow);
    await expect(
      oversized.gate({
        ...context,
        params: { ...params, arguments: { blob: 'x'.repeat(200_000) } },
      })
    ).rejects.toMatchObject({ reason: 'oversized_call' });
    expect(oversized.systemOne).not.toHaveBeenCalled();

    const malformed = new TypesafeProvider({
      client: { systemOne: () => Promise.resolve({ model: 'jev', answers: { gate: noul(7) } }) },
    }).confidenceGate({ tools, getRequest: () => 'email ada', ...allow });
    await expect(malformed(context)).rejects.toMatchObject({ reason: 'check_failed' });

    const rejected = failingGate(
      Object.assign(new Error('no'), { name: 'AuthenticationError', status: 401 }),
      allow
    );
    await expect(rejected(context)).rejects.toBeInstanceOf(TypesafeGateBlockedError);

    const aborted = failingGate(
      Object.assign(new Error('x'), { name: 'APIUserAbortError' }),
      allow
    );
    const error = await Promise.resolve(aborted(context)).catch(caught => caught);
    expect(error).toBeInstanceOf(TypesafeApiError);
    expect(error.reason).toBe('aborted');
    expect(allow.onBypass).not.toHaveBeenCalled();
  });

  it('counts vetoes across concurrent calls, so none slips past maxVetoes', async () => {
    const maxVetoes = 2;
    const { gate, systemOne } = gateWith(0.1, { maxVetoes });
    const results = await Promise.allSettled(
      Array.from({ length: maxVetoes + 2 }, (_, attempt) =>
        gate({ ...context, params: { ...params, arguments: { attempt } } })
      )
    );
    expect(systemOne).toHaveBeenCalledTimes(maxVetoes);
    const reasons = results.map(result => (result.status === 'rejected' ? result.reason : result));
    for (const reason of reasons.slice(0, maxVetoes)) {
      expect(reason).toBeInstanceOf(TypesafeGateVetoError);
    }
    for (const reason of reasons.slice(maxVetoes)) {
      expect(reason).toMatchObject({ name: 'TypesafeGateBlockedError', reason: 'max_vetoes' });
    }
  });

  it('keeps checking after a failed check', async () => {
    const mock = mockClient(questionId => (questionId === 'gate' ? noul(0.9) : undefined));
    const flaky = new TypesafeProvider({ client: mock.client }).confidenceGate({
      tools,
      getRequest: vi
        .fn<() => string>()
        .mockImplementationOnce(() => {
          throw new Error('request lookup failed');
        })
        .mockReturnValue('email ada the report'),
    });
    const [first, second] = await Promise.allSettled([flaky(context), flaky(context)]);
    expect(first.status).toBe('rejected');
    expect(second).toMatchObject({ status: 'fulfilled', value: params });
  });

  it('blocks an execution made through GoogleProvider.executeToolCall', async () => {
    const google = new GoogleProvider();
    const composio = new Composio({ apiKey: 'test-key', provider: google, allowTracking: false });
    vi.spyOn(composio.tools, 'getRawComposioToolBySlug').mockResolvedValue({
      ...tools[0],
      toolkit: { slug: 'gmail', name: 'Gmail' },
    });
    const execute = vi.spyOn(composio.getClient().tools, 'execute');
    const { gate, systemOne } = gateWith(0.1);

    await expect(
      google.executeToolCall(
        'user_1',
        { name: 'GMAIL_SEND_EMAIL', args: { to: 'mallory@example.com' } },
        undefined,
        { beforeExecute: gate }
      )
    ).rejects.toBeInstanceOf(TypesafeGateVetoError);
    expect(systemOne).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });
});
