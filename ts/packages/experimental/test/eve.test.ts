import type { ExecuteToolFn, Tool, ToolExecuteResponse } from '@composio/core';
import type { ApprovalContext } from 'eve/tools/approval';
import { describe, expect, it, vi } from 'vitest';
import {
  EveProvider,
  type EveTool,
  defineComposioTools,
  denyEveToolCall,
  requireApprovalForTools,
} from '../src/eve';

// eve reads the durable descriptors its build transform stamps on authored
// `defineTool` calls. The transform never runs on this package, so the provider
// stamps its own; `defineTool` collects them onto the definition under this
// symbol, which is what eve validates and replays from.
const DURABLE_TOOL_CALLBACKS = Symbol.for('eve:durable-dynamic-tool-callbacks');

type DurableDescriptor = {
  callback: (closure: Record<string, unknown>, ...args: never[]) => unknown;
  closure: Record<string, unknown>;
};

const durableCallbacks = (eveTool: EveTool): Partial<Record<string, DurableDescriptor>> =>
  (eveTool as unknown as Record<symbol, Partial<Record<string, DurableDescriptor>>>)[
    DURABLE_TOOL_CALLBACKS
  ] ?? {};

const requireDurableCallback = (eveTool: EveTool, phase: string): DurableDescriptor => {
  const descriptor = durableCallbacks(eveTool)[phase];
  if (!descriptor) {
    throw new TypeError(`Expected a durable "${phase}" descriptor on the wrapped tool`);
  }
  return descriptor;
};

const tool = (slug: string): Tool =>
  ({
    slug,
    name: slug,
    description: `desc ${slug}`,
    inputParameters: { type: 'object', properties: { q: { type: 'string' } } },
  }) as unknown as Tool;

const ok = (data: Record<string, unknown> = {}): ToolExecuteResponse => ({
  data,
  error: null,
  successful: true,
});

const approvalContext = (
  toolName: string,
  toolInput: Record<string, unknown>
): ApprovalContext<Record<string, unknown>> => ({
  approvedTools: new Set<string>(),
  callId: 'call-1',
  getSandbox: vi.fn<ApprovalContext['getSandbox']>(),
  getSkill: vi.fn<ApprovalContext['getSkill']>(),
  session: {
    id: 'eve-session',
    auth: { current: null, initiator: null },
    turn: { id: 'turn-1', sequence: 0 },
  },
  toolInput,
  toolName,
});

describe('EveProvider', () => {
  it('identifies as the eve provider', () => {
    expect(new EveProvider().name).toBe('eve');
  });

  it('wraps tools by slug with description and schema', () => {
    const execute: ExecuteToolFn = vi.fn(async () => ok());
    const wrapped = new EveProvider().wrapTools([tool('GITHUB_CREATE_ISSUE')], execute);
    const eveTool = wrapped.GITHUB_CREATE_ISSUE;
    expect(eveTool).toBeDefined();
    expect(eveTool.description).toBe('desc GITHUB_CREATE_ISSUE');
    expect(eveTool.inputSchema).toEqual({ type: 'object', properties: { q: { type: 'string' } } });
  });

  it("executes through Composio's executeTool", async () => {
    const execute: ExecuteToolFn = vi.fn(async () => ok({ url: 'x' }));
    const wrapped = new EveProvider().wrapTools([tool('GMAIL_SEND_EMAIL')], execute);
    const result = await wrapped.GMAIL_SEND_EMAIL.execute({ q: 'hi' }, {} as never);
    expect(execute).toHaveBeenCalledWith('GMAIL_SEND_EMAIL', { q: 'hi' });
    expect(result).toEqual(ok({ url: 'x' }));
  });

  it('does not mutate the source schema in strict mode', () => {
    const source = {
      type: 'object',
      properties: {
        required: { type: 'string' },
        optional: { type: 'string' },
      },
      required: ['required'],
    } as const;
    const composioTool = {
      ...tool('GITHUB_CREATE_ISSUE'),
      inputParameters: source,
    } as unknown as Tool;

    const wrapped = new EveProvider({ strict: true }).wrapTools(
      [composioTool],
      vi.fn(async () => ok())
    );

    expect(source.properties).toHaveProperty('optional');
    expect(source).not.toHaveProperty('additionalProperties');
    expect(wrapped.GITHUB_CREATE_ISSUE.inputSchema).toEqual({
      type: 'object',
      properties: { required: { type: 'string' } },
      required: ['required'],
      additionalProperties: false,
    });
  });

  it('lets an execute hook deny a call', async () => {
    const execute: ExecuteToolFn = vi.fn(async () => ok());
    const provider = new EveProvider({
      hooks: { execute: ctx => ctx.deny('blocked') },
    });
    const wrapped = provider.wrapTools([tool('COMPOSIO_MULTI_EXECUTE_TOOL')], execute);
    const result = await wrapped.COMPOSIO_MULTI_EXECUTE_TOOL.execute({ q: 'x' }, {} as never);
    expect(execute).not.toHaveBeenCalled();
    expect(result).toEqual(denyEveToolCall('blocked'));
  });

  it('routes remote bash calls to the remoteBash hook', async () => {
    const execute: ExecuteToolFn = vi.fn(async () => ok());
    const provider = new EveProvider({
      hooks: { remoteBash: ctx => ctx.deny('shell blocked') },
    });
    const wrapped = provider.wrapTools([tool('COMPOSIO_REMOTE_BASH_TOOL')], execute);

    const result = await wrapped.COMPOSIO_REMOTE_BASH_TOOL.execute(
      { command: 'rm -rf /tmp/example' },
      {} as never
    );

    expect(execute).not.toHaveBeenCalled();
    expect(result).toEqual(denyEveToolCall('shell blocked'));
  });

  it("passes eve's tool context to hooks", async () => {
    const eveContext = { session: { id: 'eve-session' } } as never;
    const search = vi.fn((_ctx, next) => next());
    const provider = new EveProvider({ hooks: { search } });
    const wrapped = provider.wrapTools(
      [tool('COMPOSIO_SEARCH_TOOLS')],
      vi.fn(async () => ok())
    );

    await wrapped.COMPOSIO_SEARCH_TOOLS.execute({ q: 'calendar' }, eveContext);

    expect(search.mock.calls[0]?.[0].context.eve).toBe(eveContext);
  });

  it('maps approval policy onto wrapped tools', () => {
    const needsApproval = vi.fn(
      (composioTool: Tool) => composioTool.slug === 'LOCAL_IMESSAGE_SEND'
    );
    const provider = new EveProvider({ needsApproval });
    const wrapped = provider.wrapTools(
      [tool('LOCAL_IMESSAGE_SEND'), tool('GITHUB_GET_REPOSITORY')],
      vi.fn(async () => ok())
    );
    const context = approvalContext('LOCAL_IMESSAGE_SEND', {
      to: '+15551234567',
      text: 'test',
    });

    const sendApproval = wrapped.LOCAL_IMESSAGE_SEND.approval;
    const readApproval = wrapped.GITHUB_GET_REPOSITORY.approval;
    expect(sendApproval).toBeTypeOf('function');
    expect(readApproval).toBeTypeOf('function');
    if (typeof sendApproval !== 'function' || typeof readApproval !== 'function') {
      throw new TypeError('Expected Composio approval policies to be functions');
    }
    expect(sendApproval(context)).toBe(true);
    expect(readApproval(context)).toBe(false);
    expect(needsApproval).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'LOCAL_IMESSAGE_SEND' }),
      context
    );
  });

  it('requires approval for protected tools nested in multi-execute', () => {
    const provider = new EveProvider({
      needsApproval: requireApprovalForTools('LOCAL_IMESSAGE_SEND'),
    });
    const wrapped = provider.wrapTools(
      [tool('COMPOSIO_MULTI_EXECUTE_TOOL')],
      vi.fn(async () => ok())
    );

    const approval = wrapped.COMPOSIO_MULTI_EXECUTE_TOOL.approval;
    expect(approval).toBeTypeOf('function');
    if (typeof approval !== 'function') {
      throw new TypeError('Expected the multi-execute approval policy to be a function');
    }
    expect(
      approval(
        approvalContext('COMPOSIO_MULTI_EXECUTE_TOOL', {
          tools: [
            { tool_slug: 'GMAIL_FETCH_EMAILS', arguments: {} },
            { tool_slug: 'LOCAL_IMESSAGE_SEND', arguments: { text: 'test' } },
          ],
        })
      )
    ).toBe(true);
  });

  it('finds auth links in circular data containing bigint values', async () => {
    const circular: Record<string, unknown> = {
      connectionUrl: 'https://connect.composio.dev/link_123',
      sequence: 1n,
    };
    circular.self = circular;

    const onAuthLink = vi.fn((_ctx, next) => next());
    const provider = new EveProvider({ hooks: { onAuthLink } });
    const wrapped = provider.wrapTools(
      [tool('COMPOSIO_MANAGE_CONNECTIONS')],
      vi.fn(async () => ok(circular))
    );

    await wrapped.COMPOSIO_MANAGE_CONNECTIONS.execute({}, {} as never);

    expect(onAuthLink.mock.calls[0]?.[0].url).toBe('https://connect.composio.dev/link_123');
  });

  it('finds auth links in errors even when data cannot be serialized', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    Object.defineProperty(circular, 'broken', {
      enumerable: true,
      get: () => {
        throw new Error('unserializable');
      },
    });
    const onAuthLink = vi.fn((_ctx, next) => next());
    const provider = new EveProvider({ hooks: { onAuthLink } });
    const wrapped = provider.wrapTools(
      [tool('COMPOSIO_MANAGE_CONNECTIONS')],
      vi.fn(async () => ({
        data: circular,
        error: 'Connect at https://connect.composio.dev/link_123',
        successful: false,
      }))
    );

    await expect(
      wrapped.COMPOSIO_MANAGE_CONNECTIONS.execute({}, {} as never)
    ).resolves.toMatchObject({ successful: false });
    expect(onAuthLink.mock.calls[0]?.[0].url).toBe('https://connect.composio.dev/link_123');
  });
});

describe('durable callbacks', () => {
  type ExecuteCallback = (
    closure: Record<string, unknown>,
    input: Record<string, unknown>,
    context: unknown
  ) => Promise<ToolExecuteResponse>;
  type ApproveCallback = (
    closure: Record<string, unknown>,
    context: ApprovalContext<Record<string, unknown>>
  ) => boolean;
  const persisted = (closure: Record<string, unknown>): Record<string, unknown> =>
    JSON.parse(JSON.stringify(closure));

  it('stamps a JSON-serializable execute descriptor on every wrapped tool', () => {
    const wrapped = new EveProvider().wrapTools(
      [tool('GITHUB_CREATE_ISSUE')],
      vi.fn(async () => ok())
    );

    const { callback, closure } = requireDurableCallback(wrapped.GITHUB_CREATE_ISSUE, 'execute');

    expect(callback).toBeTypeOf('function');
    expect(closure).toEqual({ slug: 'GITHUB_CREATE_ISSUE', binding: expect.any(String) });
    expect(persisted(closure)).toEqual(closure);
  });

  it('stamps an approval descriptor only when a policy is configured', () => {
    const execute: ExecuteToolFn = vi.fn(async () => ok());
    const unguarded = new EveProvider().wrapTools([tool('LOCAL_IMESSAGE_SEND')], execute);
    const guarded = new EveProvider({
      needsApproval: requireApprovalForTools('LOCAL_IMESSAGE_SEND'),
    }).wrapTools([tool('LOCAL_IMESSAGE_SEND')], execute);

    expect(durableCallbacks(unguarded.LOCAL_IMESSAGE_SEND).approvalRequest).toBeUndefined();
    expect(requireDurableCallback(guarded.LOCAL_IMESSAGE_SEND, 'approvalRequest').closure).toEqual(
      requireDurableCallback(guarded.LOCAL_IMESSAGE_SEND, 'execute').closure
    );
  });

  it('replays an execute call from its closure alone', async () => {
    const execute: ExecuteToolFn = vi.fn(async () => ok({ url: 'x' }));
    const wrapped = new EveProvider({
      hooks: { execute: (ctx, next) => next() },
    }).wrapTools([tool('COMPOSIO_EXECUTE_TOOL')], execute);
    const { callback, closure } = requireDurableCallback(wrapped.COMPOSIO_EXECUTE_TOOL, 'execute');

    const replayed = await (callback as ExecuteCallback)(persisted(closure), { q: 'hi' }, {});

    expect(execute).toHaveBeenCalledWith('COMPOSIO_EXECUTE_TOOL', { q: 'hi' });
    expect(replayed).toEqual(ok({ url: 'x' }));
  });

  it('replays an approval decision from its closure alone', () => {
    const wrapped = new EveProvider({
      needsApproval: requireApprovalForTools('LOCAL_IMESSAGE_SEND'),
    }).wrapTools(
      [tool('LOCAL_IMESSAGE_SEND')],
      vi.fn(async () => ok())
    );
    const { callback, closure } = requireDurableCallback(
      wrapped.LOCAL_IMESSAGE_SEND,
      'approvalRequest'
    );

    const decision = (callback as ApproveCallback)(
      persisted(closure),
      approvalContext('LOCAL_IMESSAGE_SEND', { text: 'test' })
    );

    expect(decision).toBe(true);
  });

  it('keeps each resolve bound to its own executor when sessions share a provider', async () => {
    const provider = new EveProvider();
    const userA: ExecuteToolFn = vi.fn(async () => ok({ from: 'a' }));
    const userB: ExecuteToolFn = vi.fn(async () => ok({ from: 'b' }));
    const { callback, closure } = requireDurableCallback(
      provider.wrapTools([tool('GMAIL_SEND_EMAIL')], userA).GMAIL_SEND_EMAIL,
      'execute'
    );

    provider.wrapTools([tool('GMAIL_SEND_EMAIL')], userB);
    const replayed = await (callback as ExecuteCallback)(persisted(closure), {}, {});

    expect(userB).not.toHaveBeenCalled();
    expect(replayed).toEqual(ok({ from: 'a' }));
  });

  it('applies the hooks of the provider that produced the closure', async () => {
    const execute: ExecuteToolFn = vi.fn(async () => ok());
    const denying = new EveProvider({
      hooks: { execute: ctx => ctx.deny('blocked by provider A') },
    }).wrapTools([tool('COMPOSIO_EXECUTE_TOOL')], execute);
    const permissive = new EveProvider().wrapTools([tool('COMPOSIO_EXECUTE_TOOL')], execute);

    // eve keeps one callback per tool name; whichever provider registered last replays both.
    const { callback } = requireDurableCallback(permissive.COMPOSIO_EXECUTE_TOOL, 'execute');
    const { closure } = requireDurableCallback(denying.COMPOSIO_EXECUTE_TOOL, 'execute');
    const replayed = await (callback as ExecuteCallback)(persisted(closure), {}, {});

    expect(execute).not.toHaveBeenCalled();
    expect(replayed).toMatchObject({ successful: false, error: 'blocked by provider A' });
  });

  it('reports a closure this process can no longer execute', async () => {
    const { callback, closure } = requireDurableCallback(
      new EveProvider().wrapTools(
        [tool('GITHUB_CREATE_ISSUE')],
        vi.fn(async () => ok())
      ).GITHUB_CREATE_ISSUE,
      'execute'
    );

    await expect(
      (callback as ExecuteCallback)({ ...closure, slug: 'GITHUB_REMOVED_TOOL' }, {}, {})
    ).rejects.toThrow('GITHUB_REMOVED_TOOL');
    await expect(
      (callback as ExecuteCallback)({ ...closure, binding: 'from-another-process' }, {}, {})
    ).rejects.toThrow('GITHUB_CREATE_ISSUE');
  });
});

describe('eve replay', () => {
  // eve's durable-callback validation and replay are not on a public export, so
  // load them from the installed package by path. If eve moves them, this suite
  // fails loudly instead of the provider silently drifting from the contract.
  const eveInternal = (file: string) =>
    import(new URL(`../node_modules/eve/dist/src/${file}`, import.meta.url).href);

  it('validates and replays a wrapped tool through eve itself', async () => {
    const [
      { validateDurableDynamicToolCallbacks },
      { replayDynamicTools },
      { callDurableDynamicCallback, lookupDurableDynamicCallback },
    ] = await Promise.all([
      eveInternal('context/dynamic-tool-lifecycle.js'),
      eveInternal('context/build-dynamic-tools.js'),
      eveInternal('tools/durable-callbacks.js'),
    ]);
    const execute: ExecuteToolFn = vi.fn(async () => ok({ replayed: true }));
    const name = 'COMPOSIO_SEARCH_TOOLS';
    const wrapped = new EveProvider({
      needsApproval: requireApprovalForTools(name),
    }).wrapTools([tool(name)], execute)[name];

    const callbacks = validateDurableDynamicToolCallbacks(name, wrapped);
    expect(callbacks).toEqual({
      execute: { closure: { slug: name, binding: expect.any(String) } },
      approvalRequest: { closure: { slug: name, binding: expect.any(String) } },
    });

    const [replayed] = replayDynamicTools([
      {
        callbacks: JSON.parse(JSON.stringify(callbacks)),
        description: wrapped.description,
        entryKey: name,
        inputSchema: wrapped.inputSchema,
        name,
        resolverSlug: 'composio',
      },
    ]);
    await expect(replayed.approval(approvalContext(name, { q: 'hi' }))).resolves.toBe(true);

    // The harness execute wrapper needs a live eve context, so call the registry
    // the way replayDynamicTools does: the registered callback plus the JSON closure.
    const registered = lookupDurableDynamicCallback(name, 'execute');
    const persistedClosure = JSON.parse(JSON.stringify(callbacks.execute.closure));
    await expect(
      callDurableDynamicCallback(registered, persistedClosure, { q: 'hi' }, {})
    ).resolves.toEqual(ok({ replayed: true }));
    expect(execute).toHaveBeenCalledWith(name, { q: 'hi' });
  });
});

describe('defineComposioTools', () => {
  const resolve = (dynamic: ReturnType<typeof defineComposioTools>) =>
    dynamic.events['step.started'] as NonNullable<(typeof dynamic.events)['step.started']>;

  it('deduplicates concurrent discovery calls', async () => {
    let release: ((tools: Record<string, never>) => void) | undefined;
    const pending = new Promise<Record<string, never>>(done => {
      release = done;
    });
    const tools = vi.fn(() => pending);
    const handler = resolve(defineComposioTools({ tools }));

    const first = handler({}, {} as never);
    const second = handler({}, {} as never);
    release?.({});

    await expect(Promise.all([first, second])).resolves.toEqual([{}, {}]);
    expect(tools).toHaveBeenCalledTimes(1);
  });

  it('retries discovery after a transient failure', async () => {
    const tools = vi
      .fn<() => Promise<Record<string, never>>>()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({});
    const handler = resolve(defineComposioTools({ tools }));

    await expect(handler({}, {} as never)).rejects.toThrow('temporary failure');
    await expect(handler({}, {} as never)).resolves.toEqual({});
    expect(tools).toHaveBeenCalledTimes(2);
  });

  it('caches independently for sessions returned by a resolver', async () => {
    const first = { tools: vi.fn(async () => ({})) };
    const second = { tools: vi.fn(async () => ({})) };
    const handler = resolve(
      defineComposioTools(context => (context.session.id === 'first' ? first : second))
    );

    await handler({}, { session: { id: 'first' } } as never);
    await handler({}, { session: { id: 'second' } } as never);
    await handler({}, { session: { id: 'first' } } as never);

    expect(first.tools).toHaveBeenCalledTimes(1);
    expect(second.tools).toHaveBeenCalledTimes(1);
  });
});
