import { describe, it, expect, vi } from 'vitest';
import { mockClient } from '../utils/mocks/client.mock';
import { toolMocks } from '../utils/mocks/data.mock';
import { Tool, ToolListParams } from '../../src/types/tool.types';
import { Tools } from '../../src/models/Tools';
import ComposioClient from '@composio/client';
import {
  createTestContext,
  setupTest,
  mockToolExecution,
  createSchemaModifier,
} from '../utils/toolExecuteUtils';
import { ValidationError } from '../../src/errors/ValidationErrors';

describe('Tools', () => {
  const context = createTestContext();
  setupTest(context);

  describe('constructor', () => {
    it('should throw an error if client is not provided', () => {
      expect(() => new Tools(null as any, context.mockProvider)).toThrow(
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
        search: undefined,
        toolkit_slug: undefined,
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
        tool_slugs: undefined,
        toolkit_slug: 'github',
        limit: 10,
        search: undefined,
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
        tool_slugs: undefined,
        toolkit_slug: 'github',
        limit: 10,
        search: 'test',
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
        tool_slugs: undefined,
        toolkit_slug: 'todoist',
        limit: 10,
        search: undefined,
        scopes: ['task:add', 'task:read'],
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
        tool_slugs: undefined,
        toolkit_slug: 'todoist',
        limit: 10,
        search: 'add task',
        scopes: ['task:add'],
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
        schemaModifier
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
          invalidModifier
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

      expect(mockClient.tools.retrieve).toHaveBeenCalledWith(slug);
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

      const result = await context.tools.getRawComposioToolBySlug(slug, schemaModifier);

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

      expect(getRawComposioToolBySlugSpy).toHaveBeenCalledWith(slug, undefined);
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

      expect(getRawComposioToolsSpy).toHaveBeenCalledWith(filters, undefined);
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

      expect(getRawComposioToolBySlugSpy).toHaveBeenCalledWith(slug, schemaModifier);
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
        version: undefined,
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
        version: undefined,
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
});
