import { describe, expect, it, vi } from 'vitest';
import type { ExecuteToolFn, Tool } from '@composio/core';
import { PiProvider, PI_COMPOSIO_SESSION_TOOL_NAMES, extractComposioConnectLinks } from '../src/index';

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
      execute: vi.fn(async (toolSlug: string) => ({ successful: true, data: { toolSlug }, error: null })),
      authorize: vi.fn(async (toolkit: string) => ({ redirectUrl: `https://connect.composio.dev/${toolkit}` })),
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
    expect(session.search).toHaveBeenCalledWith({ query: 'create github issue', toolkits: ['github'] });
    expect((searchResult.content[0] as { text: string } | undefined)?.text).toContain('GITHUB_CREATE_ISSUE');

    const execute = tools[2]!;
    await execute.execute(
      'call_execute',
      { toolSlug: 'GITHUB_CREATE_ISSUE', arguments: { title: 'Hello' }, account: 'acct' } as never,
      undefined,
      undefined,
      undefined as never
    );
    expect(session.execute).toHaveBeenCalledWith('GITHUB_CREATE_ISSUE', { title: 'Hello' }, { account: 'acct' });
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

  it('falls back to session.authorize when manage-connections execution fails', async () => {
    const session = {
      sessionId: 'trs_123',
      search: vi.fn(),
      execute: vi.fn(async () => {
        throw new Error('manage connections unavailable');
      }),
      authorize: vi.fn(async (toolkit: string) => ({ redirectUrl: `https://connect.composio.dev/${toolkit}` })),
    };
    const provider = new PiProvider();
    const [_, manageConnections] = provider.createSessionTools(session, {
      callbackUrl: 'https://example.com/callback',
    });

    const result = await manageConnections!.execute(
      'call_manage',
      { toolkits: ['github'] } as never,
      undefined,
      undefined,
      undefined as never
    );

    expect(session.authorize).toHaveBeenCalledWith('github', {
      callbackUrl: 'https://example.com/callback',
    });
    expect((result.content[0] as { text: string } | undefined)?.text).toContain('https://connect.composio.dev/github');
  });

  it('extracts Composio connect links from nested results', () => {
    expect(
      extractComposioConnectLinks({
        data: { redirectUrl: 'https://connect.composio.dev/abc123.' },
      })
    ).toEqual(['https://connect.composio.dev/abc123']);
  });
});
