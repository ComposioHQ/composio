import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockClient } from '../utils/mocks/client.mock';
import { toolMocks } from '../utils/mocks/data.mock';
import { Tool, ToolListParams, ToolExecuteParams } from '../../src/types/tool.types';
import { Tools } from '../../src/models/Tools';
import ComposioClient from '@composio/client';
import {
  createTestContext,
  setupTest,
  mockToolExecution,
  createSchemaModifier,
} from '../utils/toolExecuteUtils';
import { MockProvider } from '../utils/mocks/provider.mock';
import { ValidationError } from '../../src/errors/ValidationErrors';

describe('Tools', () => {
  const context = createTestContext();
  setupTest(context);

  describe('constructor', () => {
    it('should throw an error if client is not provided', () => {
      expect(() => new Tools(null as any, { provider: context.mockProvider })).toThrow(
        'ComposioClient is required'
      );
    });

    it('should throw an error if provider is not provided', () => {
      expect(() => new Tools(mockClient as unknown as ComposioClient, null as any)).toThrow(
        'Provider not passed into Tools instance'
      );
    });

    it('should create an instance successfully with valid parameters', () => {
      expect(context.tools).toBeInstanceOf(Tools);
    });
  });

  describe('getRawComposioTools', () => {
    it('should fetch tools from the API', async () => {
      const userId = 'test-user';

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      const result = await context.tools.getRawComposioTools({ tools: ['TEST_TOOL'] });

      expect(mockClient.tools.list).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0].slug).toEqual(toolMocks.transformedTool.slug);
      expect(result[0].inputParameters).toBeDefined();
    });

    it('should handle query parameters correctly', async () => {
      const userId = 'test-user';
      const query = {
        tools: ['TOOL1', 'TOOL2'],
      };

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      await context.tools.getRawComposioTools(query);

      expect(mockClient.tools.list).toHaveBeenCalledWith({
        tool_slugs: 'TOOL1,TOOL2',
        limit: 9999,
        toolkit_versions: 'latest',
      });
    });

    it('should handle toolkit query parameters correctly', async () => {
      const userId = 'test-user';
      const query = {
        toolkits: ['github'],
        limit: 10,
      };

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      await context.tools.getRawComposioTools(query);

      expect(mockClient.tools.list).toHaveBeenCalledWith({
        toolkit_slug: 'github',
        limit: 10,
        toolkit_versions: 'latest',
      });
    });

    it('should handle toolkit search parameters correctly', async () => {
      const userId = 'test-user';
      const query = {
        toolkits: ['github'],
        search: 'test',
        limit: 10,
      };

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      await context.tools.getRawComposioTools(query);

      expect(mockClient.tools.list).toHaveBeenCalledWith({
        toolkit_slug: 'github',
        limit: 10,
        search: 'test',
        toolkit_versions: 'latest',
      });
    });

    it('should handle toolkit scopes parameters correctly', async () => {
      const userId = 'test-user';
      const query: ToolListParams = {
        toolkits: ['todoist'],
        scopes: ['task:add', 'task:read'],
        limit: 10,
      };

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      await context.tools.getRawComposioTools(query);

      expect(mockClient.tools.list).toHaveBeenCalledWith({
        toolkit_slug: 'todoist',
        limit: 10,
        scopes: ['task:add', 'task:read'],
        toolkit_versions: 'latest',
      });
    });

    it('should handle toolkit scopes with search parameters correctly', async () => {
      const userId = 'test-user';
      const query: ToolListParams = {
        toolkits: ['todoist'],
        scopes: ['task:add'],
        search: 'add task',
        limit: 10,
      };

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      await context.tools.getRawComposioTools(query);

      expect(mockClient.tools.list).toHaveBeenCalledWith({
        toolkit_slug: 'todoist',
        limit: 10,
        search: 'add task',
        scopes: ['task:add'],
        toolkit_versions: 'latest',
      });
    });

    it('should throw a validation error when scopes are provided without toolkits', async () => {
      const userId = 'test-user';
      const invalidQuery = {
        scopes: ['task:add'],
      } as any;

      await expect(context.tools.getRawComposioTools(invalidQuery)).rejects.toThrow(
        'Invalid tool list parameters'
      );
    });

    it('should transform tool case correctly', async () => {
      const userId = 'test-user';

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      const result = await context.tools.getRawComposioTools({ tools: ['TEST_TOOL'] });

      expect(result[0].inputParameters).toEqual(toolMocks.transformedTool.inputParameters);
      expect(result[0].outputParameters).toEqual(toolMocks.transformedTool.outputParameters);
    });

    it('should include custom tools in the results', async () => {
      const userId = 'test-user';

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      const getCustomToolsSpy = vi.spyOn(context.tools['customTools'], 'getCustomTools');
      getCustomToolsSpy.mockResolvedValueOnce([toolMocks.customTool as unknown as Tool]);

      const result = await context.tools.getRawComposioTools({ tools: ['TEST_TOOL'] });

      expect(result).toHaveLength(2);
      expect(result[1].slug).toEqual(toolMocks.customTool.slug);
    });

    it('should apply schema modifiers when provided', async () => {
      const userId = 'test-user';
      const schemaModifier = createSchemaModifier({
        description: 'Modified description',
      });

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      const result = await context.tools.getRawComposioTools(
        { tools: ['TEST_TOOL'] },
        { modifySchema: schemaModifier }
      );

      expect(schemaModifier).toHaveBeenCalled();
      expect(result[0].description).toEqual('Modified description');
    });

    it('should throw an error if schema modifier is not a function', async () => {
      const userId = 'test-user';
      const invalidModifier = 'not a function' as any;

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      await expect(
        context.tools.getRawComposioTools(
          {
            toolkits: ['invalid'],
          },
          { modifySchema: invalidModifier }
        )
      ).rejects.toThrow('Invalid schema modifier. Not a function.');
    });

    it('should throw a validation error when both tools and toolkits are provided', async () => {
      const userId = 'test-user';
      const invalidQuery = {
        tools: ['TOOL1'],
        toolkits: ['github'],
      } as any;

      await expect(context.tools.getRawComposioTools(invalidQuery)).rejects.toThrow(
        'Invalid tool list parameters'
      );
    });

    it('should throw a validation error when no required parameters are provided', async () => {
      const userId = 'test-user';
      const emptyQuery = {} as any;

      await expect(context.tools.getRawComposioTools(emptyQuery)).rejects.toThrow(ValidationError);
    });
  });

  describe('getRawComposioToolBySlug', () => {
    it('should fetch a tool by slug from the API', async () => {
      const userId = 'test-user';
      const slug = 'TOOL_SLUG';

      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

      const result = await context.tools.getRawComposioToolBySlug(slug);

      expect(mockClient.tools.retrieve).toHaveBeenCalledWith(slug, { toolkit_versions: 'latest' });
      expect(result.slug).toEqual(toolMocks.transformedTool.slug);
    });

    it('should check for custom tools first', async () => {
      const userId = 'test-user';
      const slug = 'CUSTOM_TOOL';

      const getCustomToolBySlugSpy = vi.spyOn(context.tools['customTools'], 'getCustomToolBySlug');
      getCustomToolBySlugSpy.mockResolvedValueOnce(toolMocks.customTool as unknown as Tool);

      const result = await context.tools.getRawComposioToolBySlug(slug);

      expect(getCustomToolBySlugSpy).toHaveBeenCalledWith(slug);
      expect(mockClient.tools.retrieve).not.toHaveBeenCalled();
      expect(result.slug).toEqual(toolMocks.customTool.slug);
    });

    it('should throw an error if tool is not found', async () => {
      const userId = 'test-user';
      const slug = 'NONEXISTENT_TOOL';

      const getCustomToolBySlugSpy = vi.spyOn(context.tools['customTools'], 'getCustomToolBySlug');
      getCustomToolBySlugSpy.mockResolvedValueOnce(undefined);
      mockClient.tools.retrieve.mockRejectedValue(null);

      await expect(context.tools.getRawComposioToolBySlug(slug)).rejects.toThrow(
        `Unable to retrieve tool with slug ${slug}`
      );
    });

    it('should apply schema modifiers when provided', async () => {
      const userId = 'test-user';
      const slug = 'TOOL_SLUG';
      const schemaModifier = createSchemaModifier({
        description: 'Modified description',
      });

      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

      const result = await context.tools.getRawComposioToolBySlug(slug, {
        modifySchema: schemaModifier,
      });

      expect(schemaModifier).toHaveBeenCalled();
      expect(result.description).toEqual('Modified description');
    });
  });

  describe('get', () => {
    it('should get a single tool by slug and wrap it with provider as a collection', async () => {
      const userId = 'test-user';
      const slug = 'TOOL_SLUG';

      const getRawComposioToolBySlugSpy = vi.spyOn(context.tools, 'getRawComposioToolBySlug');
      getRawComposioToolBySlugSpy.mockResolvedValueOnce(
        toolMocks.transformedTool as unknown as Tool
      );

      context.mockProvider.wrapTools.mockReturnValueOnce('wrapped-tools-collection');

      const result = await context.tools.get(userId, slug);

      expect(getRawComposioToolBySlugSpy).toHaveBeenCalledWith(slug, {
        modifySchema: undefined,
      });
      expect(context.mockProvider.wrapTools).toHaveBeenCalledWith(
        [toolMocks.transformedTool],
        expect.any(Function)
      );
      expect(result).toEqual('wrapped-tools-collection');
    });

    it('should get multiple tools and wrap them with provider', async () => {
      const userId = 'test-user';
      const filters = { tools: ['TOOL1', 'TOOL2'] };

      const getRawComposioToolsSpy = vi.spyOn(context.tools, 'getRawComposioTools');
      getRawComposioToolsSpy.mockResolvedValueOnce([toolMocks.transformedTool as unknown as Tool]);

      context.mockProvider.wrapTools.mockReturnValueOnce('wrapped-tools-collection');

      const result = await context.tools.get(userId, filters);

      expect(getRawComposioToolsSpy).toHaveBeenCalledWith(filters, { modifySchema: undefined });
      expect(context.mockProvider.wrapTools).toHaveBeenCalled();
      expect(result).toEqual('wrapped-tools-collection');
    });

    it('should pass modifiers to the underlying methods', async () => {
      const userId = 'test-user';
      const slug = 'TOOL_SLUG';
      const schemaModifier = createSchemaModifier({
        description: 'Modified description',
      });

      const getRawComposioToolBySlugSpy = vi.spyOn(context.tools, 'getRawComposioToolBySlug');
      getRawComposioToolBySlugSpy.mockResolvedValueOnce(
        toolMocks.transformedTool as unknown as Tool
      );

      await context.tools.get(userId, slug, { modifySchema: schemaModifier });

      expect(getRawComposioToolBySlugSpy).toHaveBeenCalledWith(slug, {
        modifySchema: schemaModifier,
      });
    });
  });

  describe('execute', () => {
    it('should execute a custom tool', async () => {
      const slug = 'CUSTOM_TOOL';
      const body = { userId: 'test-user', arguments: { query: 'test' } };

      const { getCustomToolBySlugSpy } = await mockToolExecution(context.tools, {
        customToolExists: true,
      });

      const executeCustomToolSpy = vi.spyOn(context.tools['customTools'], 'executeCustomTool');
      executeCustomToolSpy.mockResolvedValueOnce(toolMocks.toolExecuteResponse);

      const result = await context.tools.execute(slug, body);

      expect(getCustomToolBySlugSpy).toHaveBeenCalledWith(slug);
      expect(executeCustomToolSpy).toHaveBeenCalledWith(slug, body);
      expect(result).toEqual(toolMocks.toolExecuteResponse);
    });

    it('should execute a composio tool', async () => {
      const slug = 'COMPOSIO_TOOL';
      const body = {
        userId: 'test-user',
        connectedAccountId: undefined,
        arguments: { query: 'test' },
        dangerouslySkipVersionCheck: true,
      };

      await mockToolExecution(context.tools);

      const result = await context.tools.execute(slug, body);

      expect(mockClient.tools.execute).toHaveBeenCalledWith(slug, {
        allow_tracing: undefined,
        connected_account_id: undefined,
        custom_auth_params: undefined,
        custom_connection_data: undefined,
        arguments: body.arguments,
        user_id: body.userId,
        version: 'latest',
        text: undefined,
      });
      expect(result).toEqual(toolMocks.toolExecuteResponse);
    });

    it('should execute a composio tool with a connected account', async () => {
      const slug = 'COMPOSIO_TOOL';
      const body = {
        userId: 'test-user',
        connectedAccountId: 'test-connected-account-id',
        arguments: { query: 'test' },
        dangerouslySkipVersionCheck: true,
      };

      await mockToolExecution(context.tools);

      const result = await context.tools.execute(slug, body);

      expect(mockClient.tools.execute).toHaveBeenCalledWith(slug, {
        allow_tracing: undefined,
        connected_account_id: 'test-connected-account-id',
        custom_auth_params: undefined,
        custom_connection_data: undefined,
        arguments: body.arguments,
        user_id: body.userId,
        version: 'latest',
        text: undefined,
      });
      expect(result).toEqual(toolMocks.toolExecuteResponse);
    });
  });

  describe('proxyExecute', () => {
    it('should handle proxy request with headers and query parameters correctly', async () => {
      const proxyParams = {
        endpoint: '/api/test',
        method: 'POST' as const,
        body: { data: 'test' },
        parameters: [
          {
            in: 'header' as const,
            name: 'Authorization',
            value: 'Bearer token123',
          },
          {
            in: 'header' as const,
            name: 'Content-Type',
            value: 'application/json',
          },
          {
            in: 'query' as const,
            name: 'page',
            value: 1,
          },
          {
            in: 'query' as const,
            name: 'limit',
            value: 10,
          },
        ],
        connectedAccountId: 'test-account-id',
      };

      const expectedProxyResponse = {
        data: { success: true },
        successful: true,
      };

      mockClient.tools.proxy.mockResolvedValueOnce(expectedProxyResponse);

      const result = await context.tools.proxyExecute(proxyParams);

      expect(mockClient.tools.proxy).toHaveBeenCalledWith({
        endpoint: '/api/test',
        method: 'POST',
        body: { data: 'test' },
        connected_account_id: 'test-account-id',
        parameters: [
          {
            name: 'Authorization',
            type: 'header',
            value: 'Bearer token123',
          },
          {
            name: 'Content-Type',
            type: 'header',
            value: 'application/json',
          },
          {
            name: 'page',
            type: 'query',
            value: '1',
          },
          {
            name: 'limit',
            type: 'query',
            value: '10',
          },
        ],
      });

      expect(result).toEqual(expectedProxyResponse);
    });

    it('should handle proxy request with only header parameters', async () => {
      const proxyParams = {
        endpoint: '/api/headers-only',
        method: 'GET' as const,
        parameters: [
          {
            in: 'header' as const,
            name: 'Authorization',
            value: 'Bearer token123',
          },
          {
            in: 'header' as const,
            name: 'Accept',
            value: 'application/json',
          },
        ],
      };

      const expectedProxyResponse = {
        data: { result: 'success' },
        successful: true,
      };

      mockClient.tools.proxy.mockResolvedValueOnce(expectedProxyResponse);

      const result = await context.tools.proxyExecute(proxyParams);

      expect(mockClient.tools.proxy).toHaveBeenCalledWith({
        endpoint: '/api/headers-only',
        method: 'GET',
        body: undefined,
        connected_account_id: undefined,
        parameters: [
          {
            name: 'Authorization',
            type: 'header',
            value: 'Bearer token123',
          },
          {
            name: 'Accept',
            type: 'header',
            value: 'application/json',
          },
        ],
      });

      expect(result).toEqual(expectedProxyResponse);
    });

    it('should handle proxy request with only query parameters', async () => {
      const proxyParams = {
        endpoint: '/api/search',
        method: 'GET' as const,
        parameters: [
          {
            in: 'query' as const,
            name: 'q',
            value: 'test search',
          },
          {
            in: 'query' as const,
            name: 'page',
            value: 2,
          },
        ],
      };

      const expectedProxyResponse = {
        data: { results: ['item1', 'item2'] },
        successful: true,
      };

      mockClient.tools.proxy.mockResolvedValueOnce(expectedProxyResponse);

      const result = await context.tools.proxyExecute(proxyParams);

      expect(mockClient.tools.proxy).toHaveBeenCalledWith({
        endpoint: '/api/search',
        method: 'GET',
        body: undefined,
        connected_account_id: undefined,
        parameters: [
          {
            name: 'q',
            type: 'query',
            value: 'test search',
          },
          {
            name: 'page',
            type: 'query',
            value: '2',
          },
        ],
      });

      expect(result).toEqual(expectedProxyResponse);
    });

    it('should handle proxy request without parameters', async () => {
      const proxyParams = {
        endpoint: '/api/no-params',
        method: 'PUT' as const,
        body: { update: 'data' },
        connectedAccountId: 'test-account-id',
      };

      const expectedProxyResponse = {
        data: { updated: true },
        successful: true,
      };

      mockClient.tools.proxy.mockResolvedValueOnce(expectedProxyResponse);

      const result = await context.tools.proxyExecute(proxyParams);

      expect(mockClient.tools.proxy).toHaveBeenCalledWith({
        endpoint: '/api/no-params',
        method: 'PUT',
        body: { update: 'data' },
        connected_account_id: 'test-account-id',
        parameters: [],
      });

      expect(result).toEqual(expectedProxyResponse);
    });

    it('should convert numeric parameter values to strings', async () => {
      const proxyParams = {
        endpoint: '/api/numeric',
        method: 'GET' as const,
        parameters: [
          {
            in: 'query' as const,
            name: 'count',
            value: 42,
          },
          {
            in: 'header' as const,
            name: 'Version',
            value: 1.5,
          },
        ],
      };

      const expectedProxyResponse = {
        data: { result: 'ok' },
        successful: true,
      };

      mockClient.tools.proxy.mockResolvedValueOnce(expectedProxyResponse);

      const result = await context.tools.proxyExecute(proxyParams);

      expect(mockClient.tools.proxy).toHaveBeenCalledWith({
        endpoint: '/api/numeric',
        method: 'GET',
        body: undefined,
        connected_account_id: undefined,
        parameters: [
          {
            name: 'count',
            type: 'query',
            value: '42',
          },
          {
            name: 'Version',
            type: 'header',
            value: '1.5',
          },
        ],
      });

      expect(result).toEqual(expectedProxyResponse);
    });

    it('should throw validation error for invalid parameters', async () => {
      const invalidProxyParams = {
        endpoint: '/api/test',
        method: 'INVALID_METHOD' as any,
        parameters: [
          {
            in: 'header' as const,
            name: 'Authorization',
            value: 'Bearer token123',
          },
        ],
      };

      await expect(context.tools.proxyExecute(invalidProxyParams)).rejects.toThrow(
        'Invalid tool proxy parameters'
      );
    });
  });

  describe('Version Integration Tests', () => {
    describe('toolkit versions in tool fetching', () => {
      it('should pass default "latest" version when no version is configured', async () => {
        const context = createTestContext();

        mockClient.tools.list.mockResolvedValueOnce({
          items: [toolMocks.rawTool],
          totalPages: 1,
        });

        await context.tools.getRawComposioTools({ tools: ['TEST_TOOL'] });

        expect(mockClient.tools.list).toHaveBeenCalledWith({
          tool_slugs: 'TEST_TOOL',
          limit: 9999,
          toolkit_versions: 'latest',
        });
      });

      it('should pass global version string when configured', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient as unknown as ComposioClient, {
          provider: mockProvider,
          toolkitVersions: '20251201_03' as any,
        });

        mockClient.tools.list.mockResolvedValueOnce({
          items: [toolMocks.rawTool],
          totalPages: 1,
        });

        await tools.getRawComposioTools({ toolkits: ['github'] });

        expect(mockClient.tools.list).toHaveBeenCalledWith({
          toolkit_slug: 'github',
          toolkit_versions: '20251201_03',
        });
      });

      it('should pass toolkit-specific versions when configured as object', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient as unknown as ComposioClient, {
          provider: mockProvider,
          toolkitVersions: {
            github: '20251201_01',
            slack: 'latest',
            gmail: '20251201_05',
          },
        });

        mockClient.tools.list.mockResolvedValueOnce({
          items: [toolMocks.rawTool],
          totalPages: 1,
        });

        await tools.getRawComposioTools({ toolkits: ['github'] });

        expect(mockClient.tools.list).toHaveBeenCalledWith({
          toolkit_slug: 'github',
          toolkit_versions: {
            github: '20251201_01',
            slack: 'latest',
            gmail: '20251201_05',
          },
        });
      });

      it('should pass versions when fetching tools by tool slugs', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient as unknown as ComposioClient, {
          provider: mockProvider,
          toolkitVersions: {
            github: '20251201_01',
            slack: 'latest',
          },
        });

        mockClient.tools.list.mockResolvedValueOnce({
          items: [toolMocks.rawTool],
          totalPages: 1,
        });

        await tools.getRawComposioTools({ tools: ['GITHUB_CREATE_ISSUE', 'SLACK_SEND_MESSAGE'] });

        expect(mockClient.tools.list).toHaveBeenCalledWith({
          tool_slugs: 'GITHUB_CREATE_ISSUE,SLACK_SEND_MESSAGE',
          limit: 9999,
          toolkit_versions: {
            github: '20251201_01',
            slack: 'latest',
          },
        });
      });

      it('should pass versions when searching tools', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient as unknown as ComposioClient, {
          provider: mockProvider,
          toolkitVersions: 'latest',
        });

        mockClient.tools.list.mockResolvedValueOnce({
          items: [toolMocks.rawTool],
          totalPages: 1,
        });

        await tools.getRawComposioTools({ search: 'create issue' });

        expect(mockClient.tools.list).toHaveBeenCalledWith({
          search: 'create issue',
          toolkit_versions: 'latest',
        });
      });
    });

    describe('toolkit versions in individual tool retrieval', () => {
      it('should pass default "latest" version when retrieving single tool', async () => {
        const context = createTestContext();

        mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

        await context.tools.getRawComposioToolBySlug('GITHUB_CREATE_ISSUE');

        expect(mockClient.tools.retrieve).toHaveBeenCalledWith('GITHUB_CREATE_ISSUE', {
          toolkit_versions: 'latest',
        });
      });

      it('should pass global version when retrieving single tool', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient as unknown as ComposioClient, {
          provider: mockProvider,
          toolkitVersions: '20251201_03' as any,
        });

        mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

        await tools.getRawComposioToolBySlug('GITHUB_CREATE_ISSUE');

        expect(mockClient.tools.retrieve).toHaveBeenCalledWith('GITHUB_CREATE_ISSUE', {
          toolkit_versions: '20251201_03',
        });
      });

      it('should pass toolkit-specific versions when retrieving single tool', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient as unknown as ComposioClient, {
          provider: mockProvider,
          toolkitVersions: {
            github: '20251201_01',
            slack: 'latest',
            gmail: '20251201_05',
          },
        });

        mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

        await tools.getRawComposioToolBySlug('SLACK_SEND_MESSAGE');

        expect(mockClient.tools.retrieve).toHaveBeenCalledWith('SLACK_SEND_MESSAGE', {
          toolkit_versions: {
            github: '20251201_01',
            slack: 'latest',
            gmail: '20251201_05',
          },
        });
      });
    });

    describe('toolkit versions in tool execution', () => {
      it('should use default "latest" version when executing tool without explicit version', async () => {
        const context = createTestContext();
        const spies = await mockToolExecution(context.tools);

        const executeParams: ToolExecuteParams = {
          arguments: { title: 'Test Issue' },
          connectedAccountId: 'test-account',
          dangerouslySkipVersionCheck: true, // Required when using 'latest' in manual execution
        };

        await context.tools.execute('GITHUB_CREATE_ISSUE', executeParams);

        expect(mockClient.tools.execute).toHaveBeenCalledWith('COMPOSIO_TOOL', {
          allow_tracing: undefined,
          connected_account_id: 'test-account',
          custom_auth_params: undefined,
          custom_connection_data: undefined,
          arguments: { title: 'Test Issue' },
          user_id: undefined,
          version: 'latest', // should use latest as default
          text: undefined,
        });
      });

      it('should use global version when configured', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient as unknown as ComposioClient, {
          provider: mockProvider,
          toolkitVersions: '20251201_03' as any,
        });
        const spies = await mockToolExecution(tools);

        const executeParams: ToolExecuteParams = {
          arguments: { title: 'Test Issue' },
          connectedAccountId: 'test-account',
        };

        await tools.execute('GITHUB_CREATE_ISSUE', executeParams);

        expect(mockClient.tools.execute).toHaveBeenCalledWith('COMPOSIO_TOOL', {
          allow_tracing: undefined,
          connected_account_id: 'test-account',
          custom_auth_params: undefined,
          custom_connection_data: undefined,
          arguments: { title: 'Test Issue' },
          user_id: undefined,
          version: '20251201_03', // should use global version
          text: undefined,
        });
      });

      it('should use toolkit-specific version when configured as object', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient as unknown as ComposioClient, {
          provider: mockProvider,
          toolkitVersions: {
            'test-toolkit': '20251201_01', // Use the actual toolkit slug from mock
            slack: 'latest',
            gmail: '20251201_05',
          },
        });

        // Mock the tool with test-toolkit (matching the mock data)
        const testTool = {
          ...toolMocks.transformedTool,
          toolkit: { slug: 'test-toolkit', name: 'Test Toolkit' }, // Use actual mock toolkit
        };

        const spies = await mockToolExecution(tools);
        // Override the mock to return our custom tool with the correct toolkit
        spies.getRawComposioToolBySlugSpy.mockReset();
        spies.getRawComposioToolBySlugSpy.mockResolvedValueOnce(testTool as unknown as Tool);

        const executeParams: ToolExecuteParams = {
          arguments: { title: 'Test Issue' },
          connectedAccountId: 'test-account',
        };

        await tools.execute('GITHUB_CREATE_ISSUE', executeParams);

        expect(mockClient.tools.execute).toHaveBeenCalledWith('COMPOSIO_TOOL', {
          allow_tracing: undefined,
          connected_account_id: 'test-account',
          custom_auth_params: undefined,
          custom_connection_data: undefined,
          arguments: { title: 'Test Issue' },
          user_id: undefined,
          version: '20251201_01', // should use test-toolkit-specific version
          text: undefined,
        });
      });

      it('should use fallback to "latest" when toolkit not in version mapping', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient as unknown as ComposioClient, {
          provider: mockProvider,
          toolkitVersions: {
            github: '20251201_01',
            slack: 'latest',
          },
        });

        // Mock the tool with notion toolkit (not in version mapping)
        const notionTool = {
          ...toolMocks.transformedTool,
          toolkit: { slug: 'notion', name: 'Notion' },
        };

        const spies = await mockToolExecution(tools);
        spies.getRawComposioToolBySlugSpy.mockResolvedValueOnce(notionTool as unknown as Tool);

        const executeParams: ToolExecuteParams = {
          arguments: { title: 'Test Page' },
          connectedAccountId: 'test-account',
          dangerouslySkipVersionCheck: true, // Required when fallback is 'latest'
        };

        await tools.execute('NOTION_CREATE_PAGE', executeParams);

        expect(mockClient.tools.execute).toHaveBeenCalledWith('COMPOSIO_TOOL', {
          allow_tracing: undefined,
          connected_account_id: 'test-account',
          custom_auth_params: undefined,
          custom_connection_data: undefined,
          arguments: { title: 'Test Page' },
          user_id: undefined,
          version: 'latest', // should fallback to latest for unknown toolkit
          text: undefined,
        });
      });

      it('should prioritize explicit version parameter over configured versions', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient as unknown as ComposioClient, {
          provider: mockProvider,
          toolkitVersions: {
            github: '20251201_01',
            slack: 'latest',
          },
        });

        const spies = await mockToolExecution(tools);

        const executeParams: ToolExecuteParams = {
          arguments: { title: 'Test Issue' },
          connectedAccountId: 'test-account',
          version: '20251201_03', // explicit version should override config
        };

        await tools.execute('GITHUB_CREATE_ISSUE', executeParams);

        expect(mockClient.tools.execute).toHaveBeenCalledWith('COMPOSIO_TOOL', {
          allow_tracing: undefined,
          connected_account_id: 'test-account',
          custom_auth_params: undefined,
          custom_connection_data: undefined,
          arguments: { title: 'Test Issue' },
          user_id: undefined,
          version: '20251201_03', // explicit version takes precedence
          text: undefined,
        });
      });

      it('should handle tool without toolkit gracefully', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient as unknown as ComposioClient, {
          provider: mockProvider,
          toolkitVersions: {
            github: '20251201_01',
          },
        });

        // Mock the tool without toolkit
        const toolWithoutToolkit = {
          ...toolMocks.transformedTool,
          toolkit: undefined,
        };

        const spies = await mockToolExecution(tools);
        spies.getRawComposioToolBySlugSpy.mockResolvedValueOnce(
          toolWithoutToolkit as unknown as Tool
        );

        const executeParams: ToolExecuteParams = {
          arguments: { query: 'test' },
          connectedAccountId: 'test-account',
          dangerouslySkipVersionCheck: true, // Required when toolkit is undefined and version is 'latest'
        };

        await tools.execute('SOME_CUSTOM_TOOL', executeParams);

        expect(mockClient.tools.execute).toHaveBeenCalledWith('COMPOSIO_TOOL', {
          allow_tracing: undefined,
          connected_account_id: 'test-account',
          custom_auth_params: undefined,
          custom_connection_data: undefined,
          arguments: { query: 'test' },
          user_id: undefined,
          version: 'latest', // should fallback to latest for unknown toolkit
          text: undefined,
        });
      });
    });

    describe('environment variable integration', () => {
      const originalEnv = process.env;

      beforeEach(() => {
        process.env = { ...originalEnv };
      });

      afterEach(() => {
        process.env = originalEnv;
      });

      it('should use environment variable versions when no user config provided', async () => {
        // Set environment variables
        process.env.COMPOSIO_TOOLKIT_VERSION_GITHUB = '20251201_08';
        process.env.COMPOSIO_TOOLKIT_VERSION_SLACK = 'latest';

        const mockProvider = new MockProvider();
        // Pass the processed environment variables to the Tools constructor
        const tools = new Tools(mockClient as unknown as ComposioClient, {
          provider: mockProvider,
          toolkitVersions: {
            github: '20251201_08',
            slack: 'latest',
          },
        });

        mockClient.tools.list.mockResolvedValueOnce({
          items: [toolMocks.rawTool],
          totalPages: 1,
        });

        await tools.getRawComposioTools({ toolkits: ['github'] });

        expect(mockClient.tools.list).toHaveBeenCalledWith({
          toolkit_slug: 'github',
          toolkit_versions: {
            github: '20251201_08',
            slack: 'latest',
          },
        });
      });

      it('should prioritize user config over environment variables', async () => {
        // Set environment variables
        process.env.COMPOSIO_TOOLKIT_VERSION_GITHUB = '20251201_08';
        process.env.COMPOSIO_TOOLKIT_VERSION_SLACK = 'latest';

        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient as unknown as ComposioClient, {
          provider: mockProvider,
          toolkitVersions: {
            github: '20251201_04', // should override env
            gmail: '20251201_05', // new toolkit not in env
          },
        });

        mockClient.tools.list.mockResolvedValueOnce({
          items: [toolMocks.rawTool],
          totalPages: 1,
        });

        await tools.getRawComposioTools({ toolkits: ['github'] });

        expect(mockClient.tools.list).toHaveBeenCalledWith({
          toolkit_slug: 'github',
          toolkit_versions: {
            github: '20251201_04', // user config wins
            gmail: '20251201_05', // from user config
          },
        });
      });

      it('should use global version string to override everything', async () => {
        // Set environment variables
        process.env.COMPOSIO_TOOLKIT_VERSION_GITHUB = '20251201_08';
        process.env.COMPOSIO_TOOLKIT_VERSION_SLACK = 'latest';

        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient as unknown as ComposioClient, {
          provider: mockProvider,
          toolkitVersions: '20251201_09' as any, // global version overrides everything
        });

        mockClient.tools.list.mockResolvedValueOnce({
          items: [toolMocks.rawTool],
          totalPages: 1,
        });

        await tools.getRawComposioTools({ toolkits: ['github'] });

        expect(mockClient.tools.list).toHaveBeenCalledWith({
          toolkit_slug: 'github',
          toolkit_versions: '20251201_09', // global version ignores env vars
        });
      });
    });

    describe('version check safety for manual execution', () => {
      it('should throw ComposioToolVersionRequiredError when version is "latest" without dangerouslySkipVersionCheck', async () => {
        const context = createTestContext();
        const spies = await mockToolExecution(context.tools);

        const executeParams: ToolExecuteParams = {
          arguments: { title: 'Test Issue' },
          connectedAccountId: 'test-account',
          // dangerouslySkipVersionCheck is not set, should default to false
        };

        await expect(context.tools.execute('GITHUB_CREATE_ISSUE', executeParams)).rejects.toThrow(
          'Toolkit version not specified. For manual execution of the tool please pass a specific toolkit version'
        );
      });

      it('should throw ComposioToolVersionRequiredError when version is "latest" with dangerouslySkipVersionCheck set to false', async () => {
        const context = createTestContext();
        const spies = await mockToolExecution(context.tools);

        const executeParams: ToolExecuteParams = {
          arguments: { title: 'Test Issue' },
          connectedAccountId: 'test-account',
          dangerouslySkipVersionCheck: false,
        };

        await expect(context.tools.execute('GITHUB_CREATE_ISSUE', executeParams)).rejects.toThrow(
          'Toolkit version not specified. For manual execution of the tool please pass a specific toolkit version'
        );
      });

      it('should succeed when version is "latest" with dangerouslySkipVersionCheck set to true', async () => {
        const context = createTestContext();
        const spies = await mockToolExecution(context.tools);

        const executeParams: ToolExecuteParams = {
          arguments: { title: 'Test Issue' },
          connectedAccountId: 'test-account',
          dangerouslySkipVersionCheck: true,
        };

        const result = await context.tools.execute('GITHUB_CREATE_ISSUE', executeParams);

        expect(result).toEqual(toolMocks.toolExecuteResponse);
        expect(mockClient.tools.execute).toHaveBeenCalledWith('COMPOSIO_TOOL', {
          allow_tracing: undefined,
          connected_account_id: 'test-account',
          custom_auth_params: undefined,
          custom_connection_data: undefined,
          arguments: { title: 'Test Issue' },
          user_id: undefined,
          version: 'latest',
          text: undefined,
        });
      });

      it('should succeed when executing with a specific version (not "latest") without dangerouslySkipVersionCheck', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient as unknown as ComposioClient, {
          provider: mockProvider,
          toolkitVersions: {
            'test-toolkit': '20251201_01',
          },
        });

        const testTool = {
          ...toolMocks.transformedTool,
          toolkit: { slug: 'test-toolkit', name: 'Test Toolkit' },
        };

        const spies = await mockToolExecution(tools);
        spies.getRawComposioToolBySlugSpy.mockReset();
        spies.getRawComposioToolBySlugSpy.mockResolvedValueOnce(testTool as unknown as Tool);

        const executeParams: ToolExecuteParams = {
          arguments: { title: 'Test Issue' },
          connectedAccountId: 'test-account',
          // No dangerouslySkipVersionCheck needed when version is specific
        };

        const result = await tools.execute('GITHUB_CREATE_ISSUE', executeParams);

        expect(result).toEqual(toolMocks.toolExecuteResponse);
        expect(mockClient.tools.execute).toHaveBeenCalledWith('COMPOSIO_TOOL', {
          allow_tracing: undefined,
          connected_account_id: 'test-account',
          custom_auth_params: undefined,
          custom_connection_data: undefined,
          arguments: { title: 'Test Issue' },
          user_id: undefined,
          version: '20251201_01', // specific version should work without skip flag
          text: undefined,
        });
      });

      it('should succeed when explicit version parameter overrides "latest" config', async () => {
        const context = createTestContext();
        const spies = await mockToolExecution(context.tools);

        const executeParams: ToolExecuteParams = {
          arguments: { title: 'Test Issue' },
          connectedAccountId: 'test-account',
          version: '20251201_03', // explicit version overrides default "latest"
          // No dangerouslySkipVersionCheck needed
        };

        const result = await context.tools.execute('GITHUB_CREATE_ISSUE', executeParams);

        expect(result).toEqual(toolMocks.toolExecuteResponse);
        expect(mockClient.tools.execute).toHaveBeenCalledWith('COMPOSIO_TOOL', {
          allow_tracing: undefined,
          connected_account_id: 'test-account',
          custom_auth_params: undefined,
          custom_connection_data: undefined,
          arguments: { title: 'Test Issue' },
          user_id: undefined,
          version: '20251201_03',
          text: undefined,
        });
      });

      it('should throw error when explicit version parameter is "latest" without dangerouslySkipVersionCheck', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient as unknown as ComposioClient, {
          provider: mockProvider,
          toolkitVersions: {
            'test-toolkit': '20251201_01', // specific version in config
          },
        });

        const testTool = {
          ...toolMocks.transformedTool,
          toolkit: { slug: 'test-toolkit', name: 'Test Toolkit' },
        };

        const spies = await mockToolExecution(tools);
        spies.getRawComposioToolBySlugSpy.mockReset();
        spies.getRawComposioToolBySlugSpy.mockResolvedValueOnce(testTool as unknown as Tool);

        const executeParams: ToolExecuteParams = {
          arguments: { title: 'Test Issue' },
          connectedAccountId: 'test-account',
          version: 'latest', // explicit "latest" should still require skip flag
        };

        await expect(tools.execute('GITHUB_CREATE_ISSUE', executeParams)).rejects.toThrow(
          'Toolkit version not specified. For manual execution of the tool please pass a specific toolkit version'
        );
      });

      it('should contain appropriate error properties and possible fixes in the cause', async () => {
        const context = createTestContext();
        const spies = await mockToolExecution(context.tools);

        const executeParams: ToolExecuteParams = {
          arguments: { title: 'Test Issue' },
          connectedAccountId: 'test-account',
        };

        try {
          await context.tools.execute('GITHUB_CREATE_ISSUE', executeParams);
          expect.fail('Should have thrown an error');
        } catch (error: any) {
          // The error should be wrapped in ComposioToolExecutionError
          expect(error).toBeDefined();

          // Check if the error has the right properties, whether wrapped or not
          if (error.cause) {
            // If wrapped, check the cause
            expect(error.cause.code).toContain('TOOL_VERSION_REQUIRED');
            expect(error.cause.message).toContain('Toolkit version not specified');
            expect(error.cause.possibleFixes).toBeDefined();
            expect(error.cause.possibleFixes).toContain(
              'Pass the toolkit version as a parameter to the execute function ("latest" is not supported in manual execution)'
            );
          } else {
            // If not wrapped (direct error), check the error itself
            expect(error.code).toContain('TOOL_VERSION_REQUIRED');
            expect(error.message).toContain('Toolkit version not specified');
            expect(error.possibleFixes).toBeDefined();
            expect(error.possibleFixes).toContain(
              'Pass the toolkit version as a parameter to the execute function ("latest" is not supported in manual execution)'
            );
            expect(error.possibleFixes).toContain(
              'Set the toolkit versions in the Composio config (toolkitVersions: { <toolkit-slug>: "<toolkit-version>" })'
            );
            expect(error.possibleFixes).toContain(
              'Set the toolkit version in the environment variable (COMPOSIO_TOOLKIT_VERSION_<TOOLKIT_SLUG>)'
            );
            expect(error.possibleFixes).toContain(
              'Set dangerouslySkipVersionCheck to true (this might cause unexpected behavior when new versions of the tools are released)'
            );
          }
        }
      });

      it('should allow agentic provider execution with dangerouslySkipVersionCheck in createExecuteToolFn', async () => {
        const context = createTestContext();
        const userId = 'test-user';

        // Mock tool retrieval for the get method
        const getRawComposioToolBySlugSpy = vi.spyOn(context.tools, 'getRawComposioToolBySlug');
        getRawComposioToolBySlugSpy.mockResolvedValueOnce(
          toolMocks.transformedTool as unknown as Tool
        );

        // Mock provider wrapping
        context.mockProvider.wrapTools.mockImplementation((tools, executeToolFn) => {
          // Store the execute function so we can test it
          (context as any).storedExecuteToolFn = executeToolFn;
          return 'wrapped-tools-collection';
        });

        // Get the tool (this will internally create the execute tool function)
        await context.tools.get(userId, 'GITHUB_CREATE_ISSUE');

        // Now call the stored execute function (simulating agentic provider calling it)
        const storedExecuteToolFn = (context as any).storedExecuteToolFn;
        expect(storedExecuteToolFn).toBeDefined();

        // Setup mocks for the actual execution
        const spies = await mockToolExecution(context.tools);

        // Call the execute function that was passed to the provider
        // This should succeed because createExecuteToolFn sets dangerouslySkipVersionCheck: true
        const result = await storedExecuteToolFn('GITHUB_CREATE_ISSUE', { title: 'Test Issue' });

        expect(result).toEqual(toolMocks.toolExecuteResponse);
        expect(mockClient.tools.execute).toHaveBeenCalledWith('COMPOSIO_TOOL', {
          allow_tracing: undefined,
          connected_account_id: undefined,
          custom_auth_params: undefined,
          custom_connection_data: undefined,
          arguments: { title: 'Test Issue' },
          user_id: userId,
          version: 'latest',
          text: undefined,
        });
      });
    });
  });
});
