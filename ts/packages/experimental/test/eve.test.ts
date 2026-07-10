import type { ExecuteToolFn, Tool, ToolExecuteResponse } from '@composio/core';
import { describe, expect, it, vi } from 'vitest';
import {
  EveProvider,
  defineComposioTools,
  denyEveToolCall,
  requireApprovalForTools,
} from '../src/eve';

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
    const context = {
      approvedTools: new Set<string>(),
      toolInput: { to: '+15551234567', text: 'test' },
      toolName: 'LOCAL_IMESSAGE_SEND',
    };

    expect(wrapped.LOCAL_IMESSAGE_SEND.needsApproval?.(context)).toBe(true);
    expect(wrapped.GITHUB_GET_REPOSITORY.needsApproval?.(context)).toBe(false);
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

    expect(
      wrapped.COMPOSIO_MULTI_EXECUTE_TOOL.needsApproval?.({
        approvedTools: new Set<string>(),
        toolInput: {
          tools: [
            { tool_slug: 'GMAIL_FETCH_EMAILS', arguments: {} },
            { tool_slug: 'LOCAL_IMESSAGE_SEND', arguments: { text: 'test' } },
          ],
        },
        toolName: 'COMPOSIO_MULTI_EXECUTE_TOOL',
      })
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
