import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod/v3';
import { ToolRouter } from '../../src/models/ToolRouter';
import { ToolRouterSession } from '../../src/models/ToolRouterSession';
import { createCustomTool, buildCustomToolsMap } from '../../src/models/CustomTool';
import { MockProvider } from '../utils/mocks/provider.mock';
import ComposioClient from '@composio/client';
import { Tools } from '../../src/models/Tools';
import type { CustomTool } from '../../src/types/customTool.types';

// Mock telemetry
vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: { instrument: vi.fn() },
}));

// Mock Tools class
vi.mock('../../src/models/Tools', () => ({
  Tools: vi.fn().mockImplementation(() => ({
    getRawToolRouterMetaTools: vi.fn().mockResolvedValue([
      { slug: 'COMPOSIO_SEARCH_TOOLS', name: 'Search Tools' },
      { slug: 'COMPOSIO_MULTI_EXECUTE_TOOL', name: 'Multi Execute' },
    ]),
    wrapToolsForToolRouter: vi.fn().mockReturnValue('wrapped-tools'),
    executeMetaTool: vi.fn().mockResolvedValue({
      data: { remote: true },
      error: null,
      successful: true,
    }),
  })),
}));

// ── Fixtures ─────────────────────────────────────────────────────

const createMockClient = () => ({
  baseURL: 'https://api.composio.dev',
  apiKey: 'test-api-key',
  toolRouter: {
    session: {
      create: vi.fn().mockResolvedValue({
        session_id: 'sess_123',
        mcp: { type: 'http', url: 'https://mcp.example.com/sess_123' },
        tool_router_tools: [],
      }),
      retrieve: vi.fn(),
      link: vi.fn(),
      toolkits: vi.fn(),
      executeMeta: vi.fn(),
      search: vi.fn(),
      proxyExecute: vi.fn().mockResolvedValue({
        status: 200,
        data: { ok: true },
        headers: { 'x-test': '1' },
      }),
      execute: vi.fn().mockResolvedValue({
        data: { remote_result: true },
        error: null,
        log_id: 'log_remote',
      }),
      tools: vi.fn(),
    },
  },
  tools: {
    list: vi.fn(),
    retrieve: vi.fn(),
    execute: vi.fn(),
    proxy: vi.fn(),
  },
});

// Execute returns data directly (simplified API)
const localExecute = vi.fn().mockResolvedValue({ local_result: true });

const customToolHandle = createCustomTool('GET_USER_CONTEXT', {
  name: 'Get user context',
  description: 'Retrieve user preferences',
  inputParams: z.object({ category: z.string() }),
  execute: localExecute,
});

const sessionExecute = vi.fn().mockImplementation(async (input: any, ctx: any) => ({
  userId: ctx.userId,
}));

const sessionToolHandle = createCustomTool('GET_AD_ACCOUNTS', {
  name: 'Get ad accounts',
  description: 'Get ad account IDs',
  extendsToolkit: 'meta_ads',
  inputParams: z.object({ fields: z.string() }),
  execute: sessionExecute,
});

// ── Shared helpers for provider-aware session tests ────────────

const createSessionWithProvider = (
  client: ReturnType<typeof createMockClient>,
  provider: MockProvider,
  customTools: CustomTool[]
) => {
  return new ToolRouterSession(
    client as unknown as ComposioClient,
    { apiKey: 'key', provider },
    'sess_123',
    { type: 'http' as const, url: 'https://mcp.example.com/sess_123' },
    undefined,
    buildCustomToolsMap(customTools),
    'user_1'
  );
};

const captureExecuteFn = (provider: MockProvider) => {
  provider.wrapTools.mockImplementation((tools: any, executeFn: any) => {
    (provider as any)._capturedExecuteFn = executeFn;
    (provider as any)._capturedTools = tools;
    return 'wrapped-tools-with-routing';
  });
};

// ────────────────────────────────────────────────────────────────
// ToolRouter.create() with customTools under experimental
// ────────────────────────────────────────────────────────────────

describe('ToolRouter.create() with customTools', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let router: ToolRouter<unknown, unknown, MockProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    router = new ToolRouter(mockClient as unknown as ComposioClient, {
      apiKey: 'test-key',
      provider: new MockProvider(),
    });
  });

  it('should send custom_tools under experimental in the create payload', async () => {
    await router.create('user_1', {
      toolkits: ['gmail'],
      experimental: {
        customTools: [customToolHandle],
      },
    });

    const payload = mockClient.toolRouter.session.create.mock.calls[0][0];
    expect(payload.experimental.custom_tools).toEqual([
      {
        slug: 'GET_USER_CONTEXT',
        name: 'Get user context',
        description: 'Retrieve user preferences',
        input_schema: customToolHandle.inputSchema,
      },
    ]);
  });

  it('should include extendsToolkit as extends_toolkit in serialized custom_tools', async () => {
    await router.create('user_1', {
      experimental: {
        customTools: [sessionToolHandle],
      },
    });

    const payload = mockClient.toolRouter.session.create.mock.calls[0][0];
    expect(payload.experimental.custom_tools[0].extends_toolkit).toBe('meta_ads');
  });

  it('should not send experimental.custom_tools when customTools is omitted or empty', async () => {
    await router.create('user_1', { toolkits: ['gmail'] });
    const payload1 = mockClient.toolRouter.session.create.mock.calls[0][0];
    expect(payload1.experimental).toBeUndefined();

    vi.clearAllMocks();
    await router.create('user_1', { experimental: { customTools: [] } });
    const payload2 = mockClient.toolRouter.session.create.mock.calls[0][0];
    expect(payload2.experimental).toBeUndefined();
  });

  it('should return a session with the correct sessionId', async () => {
    const session = await router.create('user_1', {
      experimental: {
        customTools: [customToolHandle],
      },
    });

    expect(session.sessionId).toBe('sess_123');
  });
});

// ────────────────────────────────────────────────────────────────
// ToolRouterSession — execution routing
// ────────────────────────────────────────────────────────────────

describe('ToolRouterSession execution routing', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  const createSession = (
    client: ReturnType<typeof createMockClient>,
    customTools: CustomTool[] = []
  ) => {
    const customToolsMap = customTools.length ? buildCustomToolsMap(customTools) : undefined;

    return new ToolRouterSession(
      client as unknown as ComposioClient,
      { apiKey: 'key', provider: new MockProvider() },
      'sess_123',
      { type: 'http' as const, url: 'https://mcp.example.com/sess_123' },
      undefined,
      customToolsMap,
      'user_1'
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    localExecute.mockClear();
    sessionExecute.mockClear();
  });

  describe('session.execute() routing', () => {
    it('should route local tool by original slug to in-process execution', async () => {
      const session = createSession(mockClient, [customToolHandle]);

      const result = await session.execute('GET_USER_CONTEXT', { category: 'prefs' });

      expect(result.data).toEqual({ local_result: true });
      expect(result.logId).toBe('');
      expect(localExecute).toHaveBeenCalledWith(
        { category: 'prefs' },
        expect.objectContaining({ userId: 'user_1' })
      );
      expect(mockClient.toolRouter.session.execute).not.toHaveBeenCalled();
    });

    it('should route local tool by prefixed slug to in-process execution', async () => {
      const session = createSession(mockClient, [customToolHandle]);

      const result = await session.execute('LOCAL_GET_USER_CONTEXT', { category: 'all' });

      expect(result.data).toEqual({ local_result: true });
      expect(localExecute).toHaveBeenCalled();
      expect(mockClient.toolRouter.session.execute).not.toHaveBeenCalled();
    });

    it('should route extendsToolkit tool by prefixed slug', async () => {
      const session = createSession(mockClient, [sessionToolHandle]);

      // sessionToolHandle has extendsToolkit: 'meta_ads' → LOCAL_META_ADS_GET_AD_ACCOUNTS
      const result = await session.execute('LOCAL_META_ADS_GET_AD_ACCOUNTS', { fields: 'id' });

      expect(result.data).toEqual({ userId: 'user_1' });
      expect(sessionExecute).toHaveBeenCalled();
      expect(mockClient.toolRouter.session.execute).not.toHaveBeenCalled();
    });

    it('should be case-insensitive for local tool lookup', async () => {
      const session = createSession(mockClient, [customToolHandle]);

      const result = await session.execute('get_user_context', { category: 'test' });

      expect(result.data).toEqual({ local_result: true });
    });

    it('should route non-local tool to remote execution', async () => {
      const session = createSession(mockClient, [customToolHandle]);

      await session.execute('GMAIL_SEND_EMAIL', { to: 'test@test.com' });

      expect(mockClient.toolRouter.session.execute).toHaveBeenCalledWith('sess_123', {
        tool_slug: 'GMAIL_SEND_EMAIL',
        arguments: { to: 'test@test.com' },
      });
      expect(localExecute).not.toHaveBeenCalled();
    });

    it('should route all tools to remote when no customTools are bound', async () => {
      const session = createSession(mockClient);

      await session.execute('GET_USER_CONTEXT', { category: 'test' });

      expect(mockClient.toolRouter.session.execute).toHaveBeenCalled();
      expect(localExecute).not.toHaveBeenCalled();
    });
  });

  describe('session.proxyExecute()', () => {
    it('should expose the same proxy response shape used by SessionContext', async () => {
      const session = createSession(mockClient, [customToolHandle]);

      const result = await session.proxyExecute({
        toolkit: 'github',
        endpoint: 'https://api.github.com/user',
        method: 'GET',
        parameters: [{ in: 'header', name: 'X-Test', value: '1' }],
      });

      expect(mockClient.toolRouter.session.proxyExecute).toHaveBeenCalledWith('sess_123', {
        toolkit_slug: 'github',
        endpoint: 'https://api.github.com/user',
        method: 'GET',
        parameters: [{ name: 'X-Test', type: 'header', value: '1' }],
      });
      expect(result).toEqual({
        status: 200,
        data: { ok: true },
        headers: { 'x-test': '1' },
      });
    });
  });

  describe('session.execute() — SessionContext injection', () => {
    it('should inject SessionContext with correct userId', async () => {
      const session = createSession(mockClient, [sessionToolHandle]);

      await session.execute('GET_AD_ACCOUNTS', { fields: 'id' });

      expect(sessionExecute).toHaveBeenCalledWith(
        { fields: 'id' },
        expect.objectContaining({
          userId: 'user_1',
        })
      );
    });

    it('should provide a working execute() on SessionContext for remote tools', async () => {
      const chainedExecute = vi.fn().mockImplementation(async (input: any, ctx: any) => {
        const inner = await ctx.execute('GMAIL_SEND_EMAIL', { to: input.to });
        return { inner_result: inner.data };
      });

      const chainedTool = createCustomTool('CHAINED_TOOL', {
        name: 'Chained',
        description: 'Calls another tool',
        inputParams: z.object({ to: z.string() }),
        execute: chainedExecute,
      });

      const session = createSession(mockClient, [chainedTool]);
      await session.execute('CHAINED_TOOL', { to: 'test@test.com' });

      expect(mockClient.toolRouter.session.execute).toHaveBeenCalledWith('sess_123', {
        tool_slug: 'GMAIL_SEND_EMAIL',
        arguments: { to: 'test@test.com' },
      });
    });

    it('should route sibling local tools in-process without hitting the API', async () => {
      const siblingExecute = vi.fn().mockResolvedValue({ siblingData: 'from-B' });
      const toolB = createCustomTool('TOOL_B', {
        name: 'Tool B',
        description: 'Sibling tool',
        inputParams: z.object({ key: z.string() }),
        execute: siblingExecute,
      });

      const toolAExecute = vi.fn().mockImplementation(async (input: any, ctx: any) => {
        const inner = await ctx.execute('TOOL_B', { key: input.value });
        return { fromA: true, fromB: inner.data };
      });
      const toolA = createCustomTool('TOOL_A', {
        name: 'Tool A',
        description: 'Calls sibling tool B',
        inputParams: z.object({ value: z.string() }),
        execute: toolAExecute,
      });

      const session = createSession(mockClient, [toolA, toolB]);
      const result = await session.execute('TOOL_A', { value: 'hello' });

      expect(siblingExecute).toHaveBeenCalledWith(
        { key: 'hello' },
        expect.objectContaining({ userId: 'user_1' })
      );
      expect(result.data).toEqual({
        fromA: true,
        fromB: { siblingData: 'from-B' },
      });
      expect(mockClient.toolRouter.session.execute).not.toHaveBeenCalled();
    });
  });

  describe('session.execute() — error handling', () => {
    it('should catch errors thrown by execute function and return error response', async () => {
      const throwingTool = createCustomTool('THROWING_TOOL', {
        name: 'Throwing',
        description: 'Throws an error',
        inputParams: z.object({}),
        execute: async () => {
          throw new Error('boom');
        },
      });

      const session = createSession(mockClient, [throwingTool]);
      const result = await session.execute('THROWING_TOOL', {});

      expect(result.error).toBe('boom');
      expect(result.data).toEqual({});
    });

    it('should apply Zod defaults when input is missing optional fields', async () => {
      const defaultExecute = vi.fn().mockImplementation(async (input: any) => ({
        category: input.category,
      }));

      const toolWithDefaults = createCustomTool('DEFAULTS_TOOL', {
        name: 'Defaults',
        description: 'Tool with default values',
        inputParams: z.object({ category: z.string().default('all') }),
        execute: defaultExecute,
      });

      const session = createSession(mockClient, [toolWithDefaults]);
      const result = await session.execute('DEFAULTS_TOOL', {});

      expect(defaultExecute).toHaveBeenCalledWith({ category: 'all' }, expect.anything());
      expect(result.data).toEqual({ category: 'all' });
    });

    it('should return validation error for invalid input', async () => {
      const strictTool = createCustomTool('STRICT_TOOL', {
        name: 'Strict',
        description: 'Tool with strict input',
        inputParams: z.object({ count: z.number() }),
        execute: vi.fn(),
      });

      const session = createSession(mockClient, [strictTool]);
      const result = await session.execute('STRICT_TOOL', { count: 'not-a-number' });

      expect(result.error).toContain('Input validation failed');
      expect(result.data).toEqual({});
    });

    it('should handle non-Error throws gracefully', async () => {
      const throwingTool = createCustomTool('STRING_THROW', {
        name: 'String throw',
        description: 'Throws a string',
        inputParams: z.object({}),
        execute: async () => {
          throw 'string error';
        },
      });

      const session = createSession(mockClient, [throwingTool]);
      const result = await session.execute('STRING_THROW', {});

      expect(result.error).toBe('string error');
    });
  });

  describe('session.tools() — COMPOSIO_MULTI_EXECUTE_TOOL routing with tools[] array', () => {
    it('should route all-local tools[] to in-process execution', async () => {
      const provider = new MockProvider();
      captureExecuteFn(provider);
      const session = createSessionWithProvider(mockClient, provider, [customToolHandle]);

      await session.tools();
      const executeFn = (provider as any)._capturedExecuteFn;

      const result = await executeFn('COMPOSIO_MULTI_EXECUTE_TOOL', {
        tools: [{ tool_slug: 'LOCAL_GET_USER_CONTEXT', arguments: { category: 'test' } }],
        sync_response_to_workbench: false,
      });

      expect(result.data).toEqual({ local_result: true });
      expect(localExecute).toHaveBeenCalledWith(
        { category: 'test' },
        expect.objectContaining({ userId: 'user_1' })
      );
    });

    it('should route local tool by non-prefixed slug in multi-execute', async () => {
      const provider = new MockProvider();
      captureExecuteFn(provider);
      const session = createSessionWithProvider(mockClient, provider, [customToolHandle]);

      await session.tools();
      const executeFn = (provider as any)._capturedExecuteFn;

      const result = await executeFn('COMPOSIO_MULTI_EXECUTE_TOOL', {
        tools: [{ tool_slug: 'GET_USER_CONTEXT', arguments: { category: 'no-prefix' } }],
        sync_response_to_workbench: false,
      });

      expect(result.data).toEqual({ local_result: true });
      expect(localExecute).toHaveBeenCalledWith(
        { category: 'no-prefix' },
        expect.objectContaining({ userId: 'user_1' })
      );
    });

    it('should route all-remote tools[] to backend', async () => {
      const provider = new MockProvider();
      captureExecuteFn(provider);
      const session = createSessionWithProvider(mockClient, provider, [customToolHandle]);

      await session.tools();
      const executeFn = (provider as any)._capturedExecuteFn;

      const result = await executeFn('COMPOSIO_MULTI_EXECUTE_TOOL', {
        tools: [{ tool_slug: 'GMAIL_SEND_EMAIL', arguments: { to: 'test@test.com' } }],
        sync_response_to_workbench: false,
      });

      expect(result.data).toEqual({ remote: true });
      expect(localExecute).not.toHaveBeenCalled();
    });

    it('should route non-MULTI_EXECUTE meta tools to backend', async () => {
      const provider = new MockProvider();
      captureExecuteFn(provider);
      const session = createSessionWithProvider(mockClient, provider, [customToolHandle]);

      await session.tools();
      const executeFn = (provider as any)._capturedExecuteFn;

      const result = await executeFn('COMPOSIO_SEARCH_TOOLS', {
        queries: [{ use_case: 'send email' }],
      });

      expect(result.data).toEqual({ remote: true });
    });

    it('should use standard wrapToolsForToolRouter when no local tools', async () => {
      const session = new ToolRouterSession(
        mockClient as unknown as ComposioClient,
        { apiKey: 'key', provider: new MockProvider() },
        'sess_123',
        { type: 'http' as const, url: 'https://mcp.example.com/sess_123' }
      );

      const result = await session.tools();

      expect(result).toBe('wrapped-tools');
    });
  });

  describe('COMPOSIO_MULTI_EXECUTE_TOOL — detailed split/merge behavior', () => {
    const setupMultiExecute = async (
      client: ReturnType<typeof createMockClient>,
      customTools: CustomTool[]
    ) => {
      const provider = new MockProvider();
      captureExecuteFn(provider);
      const session = createSessionWithProvider(client, provider, customTools);
      await session.tools();
      const executeFn = (provider as any)._capturedExecuteFn;
      const toolsInstance = (Tools as any).mock.results[(Tools as any).mock.results.length - 1]
        .value;
      return { executeFn, toolsInstance, provider, session };
    };

    const backendResponse = (results: Array<{ tool_slug: string; data: any; error?: string }>) => {
      const items = results.map((r, i) => ({
        response: {
          successful: !r.error,
          data: r.data,
          ...(r.error ? { error: r.error } : {}),
        },
        tool_slug: r.tool_slug,
        index: i,
        ...(r.error ? { error: r.error } : {}),
      }));
      const errorCount = results.filter(r => r.error).length;
      return {
        data: {
          results: items,
          total_count: results.length,
          success_count: results.length - errorCount,
          error_count: errorCount,
        },
        error: errorCount > 0 ? `${errorCount} out of ${results.length} tools failed` : null,
        successful: errorCount === 0,
      };
    };

    const findResult = (results: any[], slug: string) =>
      results.find((r: any) => r.tool_slug === slug);

    it('should append local results to remote results array', async () => {
      const { executeFn, toolsInstance } = await setupMultiExecute(mockClient, [customToolHandle]);

      toolsInstance.executeMetaTool.mockResolvedValueOnce(
        backendResponse([{ tool_slug: 'GMAIL_SEND_EMAIL', data: { sent: true } }])
      );

      const result = await executeFn('COMPOSIO_MULTI_EXECUTE_TOOL', {
        tools: [
          { tool_slug: 'LOCAL_GET_USER_CONTEXT', arguments: { category: 'a' } },
          { tool_slug: 'GMAIL_SEND_EMAIL', arguments: { to: 'x@y.com' } },
        ],
        sync_response_to_workbench: false,
      });

      const { results } = result.data;
      expect(results).toHaveLength(2);

      const remote = findResult(results, 'GMAIL_SEND_EMAIL');
      const local = findResult(results, 'LOCAL_GET_USER_CONTEXT');
      expect(remote.response.data).toEqual({ sent: true });
      expect(local.response.data).toEqual({ local_result: true });
      expect(local.response.successful).toBe(true);
    });

    it('should handle multiple local tools in same batch', async () => {
      const { executeFn } = await setupMultiExecute(mockClient, [
        customToolHandle,
        sessionToolHandle,
      ]);

      const result = await executeFn('COMPOSIO_MULTI_EXECUTE_TOOL', {
        tools: [
          { tool_slug: 'LOCAL_GET_USER_CONTEXT', arguments: { category: 'batch' } },
          { tool_slug: 'LOCAL_META_ADS_GET_AD_ACCOUNTS', arguments: { fields: 'id,name' } },
        ],
        sync_response_to_workbench: false,
      });

      expect(localExecute).toHaveBeenCalledWith(
        { category: 'batch' },
        expect.objectContaining({ userId: 'user_1' })
      );
      expect(sessionExecute).toHaveBeenCalledWith(
        { fields: 'id,name' },
        expect.objectContaining({ userId: 'user_1' })
      );

      const { results } = result.data;
      expect(results).toHaveLength(2);
      expect(findResult(results, 'LOCAL_GET_USER_CONTEXT')).toBeDefined();
      expect(findResult(results, 'LOCAL_META_ADS_GET_AD_ACCOUNTS')).toBeDefined();
    });

    it('should handle mixed batch with multiple locals + multiple remotes', async () => {
      const { executeFn, toolsInstance } = await setupMultiExecute(mockClient, [
        customToolHandle,
        sessionToolHandle,
      ]);

      toolsInstance.executeMetaTool.mockResolvedValueOnce(
        backendResponse([
          { tool_slug: 'GMAIL_SEND_EMAIL', data: { sent: true } },
          { tool_slug: 'SLACK_POST_MESSAGE', data: { ts: '999' } },
        ])
      );

      const result = await executeFn('COMPOSIO_MULTI_EXECUTE_TOOL', {
        tools: [
          { tool_slug: 'LOCAL_GET_USER_CONTEXT', arguments: { category: 'x' } },
          { tool_slug: 'GMAIL_SEND_EMAIL', arguments: { to: 'a@b.com' } },
          { tool_slug: 'LOCAL_META_ADS_GET_AD_ACCOUNTS', arguments: { fields: 'id' } },
          { tool_slug: 'SLACK_POST_MESSAGE', arguments: { channel: '#dev' } },
        ],
        sync_response_to_workbench: false,
      });

      const { results } = result.data;
      expect(results).toHaveLength(4);
      expect(findResult(results, 'LOCAL_GET_USER_CONTEXT')).toBeDefined();
      expect(findResult(results, 'LOCAL_META_ADS_GET_AD_ACCOUNTS')).toBeDefined();
      expect(findResult(results, 'GMAIL_SEND_EMAIL')).toBeDefined();
      expect(findResult(results, 'SLACK_POST_MESSAGE')).toBeDefined();

      const backendTools = toolsInstance.executeMetaTool.mock.calls[0][1].arguments.tools;
      expect(backendTools).toHaveLength(2);
      expect(backendTools.map((t: any) => t.tool_slug)).toEqual([
        'GMAIL_SEND_EMAIL',
        'SLACK_POST_MESSAGE',
      ]);

      expect(localExecute).toHaveBeenCalled();
      expect(sessionExecute).toHaveBeenCalled();
      expect(result.successful).toBe(true);
    });

    it('should recompute remote counters when local results are merged', async () => {
      const { executeFn, toolsInstance } = await setupMultiExecute(mockClient, [customToolHandle]);

      toolsInstance.executeMetaTool.mockResolvedValueOnce(
        backendResponse([{ tool_slug: 'GMAIL_SEND_EMAIL', data: { sent: true } }])
      );

      const result = await executeFn('COMPOSIO_MULTI_EXECUTE_TOOL', {
        tools: [
          { tool_slug: 'LOCAL_GET_USER_CONTEXT', arguments: { category: 'counts' } },
          { tool_slug: 'GMAIL_SEND_EMAIL', arguments: { to: 'a@b.com' } },
        ],
        sync_response_to_workbench: false,
      });

      expect(result.data.total_count).toBe(2);
      expect(result.data.success_count).toBe(2);
      expect(result.data.error_count).toBe(0);
    });

    it('should handle remote null data without crashing', async () => {
      const { executeFn, toolsInstance } = await setupMultiExecute(mockClient, [customToolHandle]);

      toolsInstance.executeMetaTool.mockResolvedValueOnce({
        data: null,
        error: null,
        successful: true,
      });

      const result = await executeFn('COMPOSIO_MULTI_EXECUTE_TOOL', {
        tools: [
          { tool_slug: 'LOCAL_GET_USER_CONTEXT', arguments: { category: 'x' } },
          { tool_slug: 'GMAIL_SEND_EMAIL', arguments: { to: 'a@b.com' } },
        ],
        sync_response_to_workbench: false,
      });

      expect(result.successful).toBe(true);
      expect(result.data.results).toHaveLength(1);
      expect(findResult(result.data.results, 'LOCAL_GET_USER_CONTEXT')).toBeDefined();
    });

    it('should surface errors from both local and remote tools', async () => {
      const throwingHandle = createCustomTool('MIXED_THROWER', {
        name: 'Throws in batch',
        description: 'Throws',
        inputParams: z.object({}),
        execute: async () => {
          throw new Error('batch-boom');
        },
      });

      const { executeFn, toolsInstance } = await setupMultiExecute(mockClient, [
        customToolHandle,
        throwingHandle,
      ]);

      toolsInstance.executeMetaTool.mockResolvedValueOnce(
        backendResponse([
          { tool_slug: 'GMAIL_SEND_EMAIL', data: { sent: true } },
          {
            tool_slug: 'SLACK_POST_MESSAGE',
            data: { message: 'auth failed' },
            error: 'auth failed',
          },
        ])
      );

      const result = await executeFn('COMPOSIO_MULTI_EXECUTE_TOOL', {
        tools: [
          { tool_slug: 'LOCAL_GET_USER_CONTEXT', arguments: { category: 'ok' } },
          { tool_slug: 'LOCAL_MIXED_THROWER', arguments: {} },
          { tool_slug: 'GMAIL_SEND_EMAIL', arguments: { to: 'a@b.com' } },
          { tool_slug: 'SLACK_POST_MESSAGE', arguments: { channel: '#dev' } },
        ],
        sync_response_to_workbench: false,
      });

      const { results } = result.data;
      expect(results).toHaveLength(4);

      const localOk = findResult(results, 'LOCAL_GET_USER_CONTEXT');
      expect(localOk.response.successful).toBe(true);

      const localErr = findResult(results, 'LOCAL_MIXED_THROWER');
      expect(localErr.response.successful).toBe(false);
      expect(localErr.response.error).toBe('batch-boom');
      expect(localErr.error).toBe('batch-boom');

      const remoteErr = findResult(results, 'SLACK_POST_MESSAGE');
      expect(remoteErr.response.error).toBe('auth failed');

      expect(result.successful).toBe(false);
      expect(result.error).toContain('2 out of 4');
    });

    it('should preserve batch-level remote errors when no per-tool remote results exist', async () => {
      const { executeFn, toolsInstance } = await setupMultiExecute(mockClient, [customToolHandle]);

      toolsInstance.executeMetaTool.mockResolvedValueOnce({
        data: null,
        error: 'Remote batch failed before per-tool results were produced',
        successful: false,
      });

      const result = await executeFn('COMPOSIO_MULTI_EXECUTE_TOOL', {
        tools: [
          { tool_slug: 'LOCAL_GET_USER_CONTEXT', arguments: { category: 'x' } },
          { tool_slug: 'GMAIL_SEND_EMAIL', arguments: { to: 'a@b.com' } },
        ],
        sync_response_to_workbench: false,
      });

      expect(result.successful).toBe(false);
      expect(result.error).toBe('Remote batch failed before per-tool results were produced');
    });

    it('should forward to backend when tools array is empty', async () => {
      const { executeFn, toolsInstance } = await setupMultiExecute(mockClient, [customToolHandle]);

      await executeFn('COMPOSIO_MULTI_EXECUTE_TOOL', {
        tools: [],
        sync_response_to_workbench: false,
      });

      expect(toolsInstance.executeMetaTool).toHaveBeenCalledWith(
        'COMPOSIO_MULTI_EXECUTE_TOOL',
        expect.objectContaining({
          sessionId: 'sess_123',
          arguments: expect.objectContaining({ tools: [] }),
        }),
        undefined
      );
    });

    it('should handle non-object items in tools array gracefully', async () => {
      const { executeFn, toolsInstance } = await setupMultiExecute(mockClient, [customToolHandle]);

      toolsInstance.executeMetaTool.mockResolvedValueOnce(backendResponse([]));

      const result = await executeFn('COMPOSIO_MULTI_EXECUTE_TOOL', {
        tools: [
          'not-an-object',
          null,
          { tool_slug: 'LOCAL_GET_USER_CONTEXT', arguments: { category: 'ok' } },
        ],
        sync_response_to_workbench: false,
      });

      expect(localExecute).toHaveBeenCalledWith(
        { category: 'ok' },
        expect.objectContaining({ userId: 'user_1' })
      );
      const { results } = result.data;
      expect(findResult(results, 'LOCAL_GET_USER_CONTEXT')).toBeDefined();
    });

    it('should execute local and remote in parallel (not sequentially)', async () => {
      const callOrder: string[] = [];

      const slowLocalHandle = createCustomTool('SLOW_LOCAL', {
        name: 'Slow local',
        description: 'Slow',
        inputParams: z.object({}),
        execute: async () => {
          callOrder.push('local-start');
          await new Promise(r => setTimeout(r, 50));
          callOrder.push('local-end');
          return { slow: true };
        },
      });

      const provider = new MockProvider();
      captureExecuteFn(provider);
      const session = createSessionWithProvider(mockClient, provider, [slowLocalHandle]);
      await session.tools();
      const executeFn = (provider as any)._capturedExecuteFn;
      const toolsInstance = (Tools as any).mock.results[(Tools as any).mock.results.length - 1]
        .value;

      toolsInstance.executeMetaTool.mockImplementation(async () => {
        callOrder.push('remote-start');
        await new Promise(r => setTimeout(r, 50));
        callOrder.push('remote-end');
        return backendResponse([{ tool_slug: 'GMAIL_SEND_EMAIL', data: { sent: true } }]);
      });

      await executeFn('COMPOSIO_MULTI_EXECUTE_TOOL', {
        tools: [
          { tool_slug: 'LOCAL_SLOW_LOCAL', arguments: {} },
          { tool_slug: 'GMAIL_SEND_EMAIL', arguments: { to: 'x@y.com' } },
        ],
        sync_response_to_workbench: false,
      });

      const localStartIdx = callOrder.indexOf('local-start');
      const remoteStartIdx = callOrder.indexOf('remote-start');
      const localEndIdx = callOrder.indexOf('local-end');
      const remoteEndIdx = callOrder.indexOf('remote-end');

      expect(localStartIdx).toBeGreaterThanOrEqual(0);
      expect(remoteStartIdx).toBeGreaterThanOrEqual(0);
      expect(Math.max(localStartIdx, remoteStartIdx)).toBeLessThan(
        Math.min(localEndIdx, remoteEndIdx)
      );
    });
  });

  describe('multiple custom tools', () => {
    it('should route each tool to its correct execute function', async () => {
      const session = createSession(mockClient, [customToolHandle, sessionToolHandle]);

      await session.execute('GET_USER_CONTEXT', { category: 'prefs' });
      expect(localExecute).toHaveBeenCalled();
      expect(sessionExecute).not.toHaveBeenCalled();

      localExecute.mockClear();

      await session.execute('GET_AD_ACCOUNTS', { fields: 'id' });
      expect(sessionExecute).toHaveBeenCalled();
      expect(localExecute).not.toHaveBeenCalled();
    });
  });

  describe('per-tool results — each tool gets its own entry in results[]', () => {
    it('should return per-tool results for mixed local+remote batch', async () => {
      const provider = new MockProvider();
      captureExecuteFn(provider);
      const session = createSessionWithProvider(mockClient, provider, [customToolHandle]);

      await session.tools();

      const latestToolsInstance = (Tools as any).mock.results[
        (Tools as any).mock.results.length - 1
      ].value;
      latestToolsInstance.executeMetaTool.mockResolvedValueOnce({
        data: {
          results: [
            {
              response: { successful: true, data: { message_id: 'msg_1' } },
              tool_slug: 'GMAIL_SEND_EMAIL',
              index: 0,
            },
            {
              response: { successful: true, data: { ts: '123456' } },
              tool_slug: 'SLACK_POST_MESSAGE',
              index: 1,
            },
          ],
          total_count: 2,
          success_count: 2,
          error_count: 0,
        },
        error: null,
        successful: true,
      });

      const executeFn = (provider as any)._capturedExecuteFn;

      const result = await executeFn('COMPOSIO_MULTI_EXECUTE_TOOL', {
        tools: [
          { tool_slug: 'LOCAL_GET_USER_CONTEXT', arguments: { category: 'prefs' } },
          { tool_slug: 'GMAIL_SEND_EMAIL', arguments: { to: 'a@b.com' } },
          { tool_slug: 'SLACK_POST_MESSAGE', arguments: { channel: '#general' } },
        ],
        sync_response_to_workbench: false,
      });

      const { results } = result.data;
      expect(results).toHaveLength(3);

      const local = results.find((r: any) => r.tool_slug === 'LOCAL_GET_USER_CONTEXT');
      const gmail = results.find((r: any) => r.tool_slug === 'GMAIL_SEND_EMAIL');
      const slack = results.find((r: any) => r.tool_slug === 'SLACK_POST_MESSAGE');

      expect(local.response.data).toEqual({ local_result: true });
      expect(gmail.response.data).toEqual({ message_id: 'msg_1' });
      expect(slack.response.data).toEqual({ ts: '123456' });
    });
  });

  describe('provider guard — session.tools() throws without provider', () => {
    it('should throw when provider is not configured but local tools exist', async () => {
      const customToolsMap = buildCustomToolsMap([customToolHandle]);

      const session = new ToolRouterSession(
        mockClient as unknown as ComposioClient,
        { apiKey: 'key' } as any,
        'sess_123',
        { type: 'http' as const, url: 'https://mcp.example.com/sess_123' },
        undefined,
        customToolsMap,
        'user_1'
      );

      await expect(session.tools()).rejects.toThrow(
        'A provider is required when using custom tools with session.tools()'
      );
    });
  });
});
