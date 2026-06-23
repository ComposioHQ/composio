import { describe, expect, it, vi } from 'vitest';
import type { ExecuteToolFn, Tool } from '@composio/core';
import {
  PiProvider,
  PI_COMPOSIO_SESSION_TOOL_NAMES,
  extractComposioConnectLinks,
} from '../src/index';

const composioTool = {
  slug: 'GITHUB_CREATE_ISSUE',
  name: 'Create Issue',
  description: 'Create a GitHub issue',
  inputParameters: {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      repo: { type: 'string' },
      title: { type: 'string' },
    },
    required: ['owner', 'repo', 'title'],
  },
} as Tool;

describe('PiProvider', () => {
  it('wraps a Composio tool as a Pi custom tool', async () => {
    const executeTool = vi.fn(async () => ({
      successful: true,
      data: { issueNumber: 123 },
      error: null,
      logId: 'log_123',
    })) as unknown as ExecuteToolFn;
    const provider = new PiProvider();

    const tool = provider.wrapTool(composioTool, executeTool);

    expect(tool.name).toBe('GITHUB_CREATE_ISSUE');
    expect(tool.label).toContain('Create Issue');
    expect(tool.parameters).toMatchObject({ type: 'object' });

    const result = await tool.execute(
      'call_1',
      { owner: 'ComposioHQ', repo: 'composio', title: 'Test' } as never,
      undefined,
      undefined,
      undefined as never
    );

    expect(executeTool).toHaveBeenCalledWith('GITHUB_CREATE_ISSUE', {
      owner: 'ComposioHQ',
      repo: 'composio',
      title: 'Test',
    });
    expect((result.content[0] as { text: string } | undefined)?.text).toContain('issueNumber');
    expect(result.details.slug).toBe('GITHUB_CREATE_ISSUE');
  });

  it('creates dynamic session tools for search, manage connections, and execute', async () => {
    const session = {
      sessionId: 'trs_123',
      search: vi.fn(async () => ({ results: [{ tool: 'GITHUB_CREATE_ISSUE' }] })),
      execute: vi.fn(async (toolSlug: string) => ({
        successful: true,
        data: { toolSlug },
        error: null,
      })),
      authorize: vi.fn(async (toolkit: string) => ({
        redirectUrl: `https://connect.composio.dev/${toolkit}`,
      })),
    };
    const provider = new PiProvider();
    const tools = provider.createSessionTools(session);

    expect(tools.map(tool => tool.name)).toEqual([
      PI_COMPOSIO_SESSION_TOOL_NAMES.search,
      PI_COMPOSIO_SESSION_TOOL_NAMES.manageConnections,
      PI_COMPOSIO_SESSION_TOOL_NAMES.execute,
    ]);

    const search = tools[0]!;
    const searchResult = await search.execute(
      'call_search',
      { query: 'create github issue', toolkits: ['github'] } as never,
      undefined,
      undefined,
      undefined as never
    );
    expect(session.search).toHaveBeenCalledWith({
      query: 'create github issue',
      toolkits: ['github'],
    });
    expect((searchResult.content[0] as { text: string } | undefined)?.text).toContain(
      'GITHUB_CREATE_ISSUE'
    );

    const execute = tools[2]!;
    await execute.execute(
      'call_execute',
      { toolSlug: 'GITHUB_CREATE_ISSUE', arguments: { title: 'Hello' }, account: 'acct' } as never,
      undefined,
      undefined,
      undefined as never
    );
    expect(session.execute).toHaveBeenCalledWith(
      'GITHUB_CREATE_ISSUE',
      { title: 'Hello' },
      { account: 'acct' }
    );
  });

  it('can include first-class remote workbench helpers', async () => {
    const session = {
      sessionId: 'trs_123',
      search: vi.fn(),
      execute: vi.fn(async (toolSlug: string, args: Record<string, unknown>) => ({
        successful: true,
        data: { toolSlug, args },
        error: null,
      })),
      authorize: vi.fn(),
    };
    const provider = new PiProvider();
    const tools = provider.createSessionTools(session, { includeWorkbenchTools: true });

    expect(tools.map(tool => tool.name)).toEqual([
      PI_COMPOSIO_SESSION_TOOL_NAMES.search,
      PI_COMPOSIO_SESSION_TOOL_NAMES.manageConnections,
      PI_COMPOSIO_SESSION_TOOL_NAMES.execute,
      PI_COMPOSIO_SESSION_TOOL_NAMES.remoteWorkbench,
      PI_COMPOSIO_SESSION_TOOL_NAMES.remoteBash,
    ]);

    const remoteWorkbench = tools[3]!;
    await remoteWorkbench.execute(
      'call_workbench',
      { code_to_execute: 'print("hello")' } as never,
      undefined,
      undefined,
      undefined as never
    );

    expect(session.execute).toHaveBeenCalledWith('COMPOSIO_REMOTE_WORKBENCH', {
      code_to_execute: 'print("hello")',
      session_id: 'trs_123',
    });

    const remoteBash = tools[4]!;
    await remoteBash.execute(
      'call_bash',
      { command: 'ls -la', session_id: 'workflow-1' } as never,
      undefined,
      undefined,
      undefined as never
    );

    expect(session.execute).toHaveBeenCalledWith('COMPOSIO_REMOTE_BASH_TOOL', {
      command: 'ls -la',
      session_id: 'workflow-1',
    });
  });

  it('manages connections through native toolkit-state and authorize handlers without executing a meta tool', async () => {
    const session = {
      sessionId: 'trs_123',
      search: vi.fn(async (_params: { query: string; toolkits?: string[] }) => ({})),
      execute: vi.fn(
        async (
          _toolSlug: string,
          _args?: Record<string, unknown>,
          _options?: { account?: string }
        ) => ({})
      ),
      toolkits: vi.fn(async (_options?: { toolkits?: string[] }) => ({
        items: [
          { slug: 'github', connection: { isActive: true } },
          { slug: 'gmail', connection: undefined },
        ],
      })),
      authorize: vi.fn(async (toolkit: string, _options?: unknown) => ({
        redirectUrl: `https://connect.composio.dev/${toolkit}`,
      })),
    };
    const handleAuthLink = vi.fn();
    const provider = new PiProvider();
    const [_, manageConnections] = provider.createSessionTools({
      sessionId: session.sessionId,
      search: session.search,
      execute: session.execute,
      connections: {
        getToolkitStates: (toolkits: string[]) => session.toolkits({ toolkits }),
        authorizeToolkit: (toolkit: string, options: unknown) =>
          session.authorize(toolkit, options),
      },
      authLinks: { handle: handleAuthLink },
      callbackUrl: 'https://example.com/callback',
    });

    const result = await manageConnections!.execute(
      'call_manage',
      { toolkits: ['github', 'gmail'] } as never,
      undefined,
      undefined,
      undefined as never
    );

    expect(session.toolkits).toHaveBeenCalledWith({ toolkits: ['github', 'gmail'] });
    expect(session.authorize).toHaveBeenCalledWith('gmail', {
      callbackUrl: 'https://example.com/callback',
      reinitiate: false,
    });
    expect(session.execute).not.toHaveBeenCalledWith(
      'COMPOSIO_MANAGE_CONNECTIONS',
      expect.anything(),
      expect.anything()
    );
    expect(handleAuthLink).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://connect.composio.dev/gmail',
        toolkit: 'gmail',
        sourceTool: PI_COMPOSIO_SESSION_TOOL_NAMES.manageConnections,
      })
    );
    expect((result.content[0] as { text: string } | undefined)?.text).toContain('auth_initiated');
  });

  it('applies search and execute policy hooks', async () => {
    const search = vi.fn(async () => ({ results: [{ tool: 'SLACKBOT_SEND_MESSAGE' }] }));
    const execute = vi.fn(async (toolSlug: string, args: Record<string, unknown>) => ({
      successful: true,
      data: { toolSlug, args },
      error: null,
    }));
    const provider = new PiProvider();
    const tools = provider.createSessionTools({
      search,
      execute,
      policy: {
        normalizeSearchToolkits: ({ toolkits }) =>
          toolkits?.map(toolkit => (toolkit === 'slack' ? 'slackbot' : toolkit)),
        beforeExecute: ({ toolSlug, args }) =>
          toolSlug.startsWith('COMPOSIO_')
            ? { action: 'deny', result: { successful: false, error: 'meta tools blocked' } }
            : { action: 'execute', toolSlug: toolSlug.replace(/^SLACK_/, 'SLACKBOT_'), args },
      },
    });

    const searchTool = tools[0]!;
    await searchTool.execute(
      'call_search',
      { query: 'message channel', toolkits: ['slack'] } as never,
      undefined,
      undefined,
      undefined as never
    );
    expect(search).toHaveBeenCalledWith(
      { query: 'message channel', toolkits: ['slackbot'] },
      expect.objectContaining({ requestedToolkits: ['slack'] })
    );

    const executeTool = tools[2]!;
    await executeTool.execute(
      'call_execute',
      { toolSlug: 'SLACK_SEND_MESSAGE', arguments: { text: 'hi' } } as never,
      undefined,
      undefined,
      undefined as never
    );
    expect(execute).toHaveBeenCalledWith(
      'SLACKBOT_SEND_MESSAGE',
      { text: 'hi' },
      undefined,
      expect.objectContaining({ toolSlug: 'SLACKBOT_SEND_MESSAGE' })
    );

    const denied = await executeTool.execute(
      'call_execute',
      { toolSlug: 'COMPOSIO_MANAGE_CONNECTIONS', arguments: {} } as never,
      undefined,
      undefined,
      undefined as never
    );
    expect((denied.content[0] as { text: string } | undefined)?.text).toContain(
      'meta tools blocked'
    );
  });

  it('extracts Composio connect links from nested results', () => {
    expect(
      extractComposioConnectLinks({
        data: { redirectUrl: 'https://connect.composio.dev/abc123.' },
      })
    ).toEqual(['https://connect.composio.dev/abc123']);
  });
});
