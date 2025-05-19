import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Tools } from '../../src/models/Tools';
import { mockClient } from './mocks/client.mock';
import { MockToolset } from './mocks/toolset.mock';
import { connectedAccountMocks, toolkitMocks, toolMocks } from './mocks/data.mock';
import ComposioClient from '@composio/client';
import { Tool } from '../../src/types/tool.types';

describe('Tools', () => {
  let tools: Tools<unknown, unknown, MockToolset>;
  let mockToolset: MockToolset;

  beforeEach(() => {
    vi.clearAllMocks();
    mockToolset = new MockToolset();
    tools = new Tools(mockClient as unknown as ComposioClient, mockToolset);
  });

  describe('constructor', () => {
    it('should throw an error if client is not provided', () => {
      expect(() => new Tools(null as any, mockToolset)).toThrow('ComposioClient is required');
    });

    it('should throw an error if toolset is not provided', () => {
      expect(() => new Tools(mockClient as unknown as ComposioClient, null as any)).toThrow(
        'Toolset not passed into Tools instance'
      );
    });

    it('should create an instance successfully with valid parameters', () => {
      expect(tools).toBeInstanceOf(Tools);
    });
  });

  describe('getComposioTools', () => {
    it('should fetch tools from the API', async () => {
      const userId = 'test-user';

      // Mock the API response
      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      const result = await tools.getComposioTools(userId);

      expect(mockClient.tools.list).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0].slug).toEqual(toolMocks.transformedTool.slug);
      expect(result[0].inputParameters).toBeDefined();
    });

    it('should handle query parameters correctly', async () => {
      const userId = 'test-user';
      const query = {
        tools: ['TOOL1', 'TOOL2'],
        limit: '10',
      };

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      await tools.getComposioTools(userId, query);

      expect(mockClient.tools.list).toHaveBeenCalledWith({
        tool_slugs: 'TOOL1,TOOL2',
        limit: '10',
        cursor: undefined,
        important: undefined,
        search: undefined,
        toolkit_slug: undefined,
      });
    });

    it('should transform tool case correctly', async () => {
      const userId = 'test-user';

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      const result = await tools.getComposioTools(userId);

      expect(result[0].inputParameters).toEqual(toolMocks.transformedTool.inputParameters);
      expect(result[0].outputParameters).toEqual(toolMocks.transformedTool.outputParameters);
    });

    it('should include custom tools in the results', async () => {
      const userId = 'test-user';

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      // Mock custom tools
      const getCustomToolsSpy = vi.spyOn(tools['customTools'], 'getCustomTools');
      getCustomToolsSpy.mockResolvedValueOnce([toolMocks.customTool as unknown as Tool]);

      const result = await tools.getComposioTools(userId);

      expect(result).toHaveLength(2);
      expect(result[1].slug).toEqual(toolMocks.customTool.slug);
    });

    it('should apply schema modifiers when provided', async () => {
      const userId = 'test-user';
      const modifier = vi.fn((slug, toolkit, tool) => ({
        ...tool,
        description: 'Modified description',
      }));

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      const result = await tools.getComposioTools(userId, {}, modifier);

      expect(modifier).toHaveBeenCalled();
      expect(result[0].description).toEqual('Modified description');
    });

    it('should throw an error if schema modifier is not a function', async () => {
      const userId = 'test-user';
      const invalidModifier = 'not a function' as any;

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      await expect(tools.getComposioTools(userId, {}, invalidModifier)).rejects.toThrow(
        'Invalid schema modifier. Not a function.'
      );
    });
  });

  describe('getComposioToolBySlug', () => {
    it('should fetch a tool by slug from the API', async () => {
      const userId = 'test-user';
      const slug = 'TOOL_SLUG';

      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

      const result = await tools.getComposioToolBySlug(userId, slug);

      expect(mockClient.tools.retrieve).toHaveBeenCalledWith(slug);
      expect(result.slug).toEqual(toolMocks.transformedTool.slug);
    });

    it('should check for custom tools first', async () => {
      const userId = 'test-user';
      const slug = 'CUSTOM_TOOL';

      // Mock that a custom tool exists
      const getCustomToolBySlugSpy = vi.spyOn(tools['customTools'], 'getCustomToolBySlug');
      getCustomToolBySlugSpy.mockResolvedValueOnce(toolMocks.customTool as unknown as Tool);

      const result = await tools.getComposioToolBySlug(userId, slug);

      expect(getCustomToolBySlugSpy).toHaveBeenCalledWith(slug);
      expect(mockClient.tools.retrieve).not.toHaveBeenCalled();
      expect(result.slug).toEqual(toolMocks.customTool.slug);
    });

    it('should throw an error if tool is not found', async () => {
      const userId = 'test-user';
      const slug = 'NONEXISTENT_TOOL';

      // Mock that no custom tool exists and API returns null
      const getCustomToolBySlugSpy = vi.spyOn(tools['customTools'], 'getCustomToolBySlug');
      getCustomToolBySlugSpy.mockResolvedValueOnce(undefined);
      mockClient.tools.retrieve.mockResolvedValueOnce(null);

      await expect(tools.getComposioToolBySlug(userId, slug)).rejects.toThrow(
        `Tool with slug ${slug} not found`
      );
    });

    it('should apply schema modifiers when provided', async () => {
      const userId = 'test-user';
      const slug = 'TOOL_SLUG';
      const modifier = vi.fn((slug, toolkit, tool) => ({
        ...tool,
        description: 'Modified description',
      }));

      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

      const result = await tools.getComposioToolBySlug(userId, slug, modifier);

      expect(modifier).toHaveBeenCalled();
      expect(result.description).toEqual('Modified description');
    });
  });

  describe('get', () => {
    it('should get a single tool and wrap it with toolset', async () => {
      const userId = 'test-user';
      const slug = 'TOOL_SLUG';

      // Mock ComposioToolBySlug
      const getComposioToolBySlugSpy = vi.spyOn(tools, 'getComposioToolBySlug');
      getComposioToolBySlugSpy.mockResolvedValueOnce(toolMocks.transformedTool as unknown as Tool);

      // Mock toolset's wrapTool
      mockToolset.wrapTool.mockReturnValueOnce('wrapped-tool');

      const result = await tools.get(userId, slug);

      expect(getComposioToolBySlugSpy).toHaveBeenCalledWith(userId, slug, undefined);
      expect(mockToolset.wrapTool).toHaveBeenCalled();
      expect(result).toEqual('wrapped-tool');
    });

    it('should get multiple tools and wrap them with toolset', async () => {
      const userId = 'test-user';
      const filters = { tools: ['TOOL1', 'TOOL2'] };

      // Mock ComposioTools
      const getComposioToolsSpy = vi.spyOn(tools, 'getComposioTools');
      getComposioToolsSpy.mockResolvedValueOnce([toolMocks.transformedTool as unknown as Tool]);

      // Mock toolset's wrapTools
      mockToolset.wrapTools.mockReturnValueOnce('wrapped-tools');

      const result = await tools.get(userId, filters);

      expect(getComposioToolsSpy).toHaveBeenCalledWith(userId, filters, undefined);
      expect(mockToolset.wrapTools).toHaveBeenCalled();
      expect(result).toEqual('wrapped-tools');
    });

    it('should pass modifiers to the underlying methods', async () => {
      const userId = 'test-user';
      const slug = 'TOOL_SLUG';
      const options = {
        modifyToolSchema: vi.fn(),
        beforeToolExecute: vi.fn(),
        afterToolExecute: vi.fn(),
      };

      // Mock ComposioToolBySlug
      const getComposioToolBySlugSpy = vi.spyOn(tools, 'getComposioToolBySlug');
      getComposioToolBySlugSpy.mockResolvedValueOnce(toolMocks.transformedTool as unknown as Tool);

      await tools.get(userId, slug, options);

      expect(getComposioToolBySlugSpy).toHaveBeenCalledWith(userId, slug, options.modifyToolSchema);
    });
  });

  describe('execute', () => {
    it('should execute a custom tool', async () => {
      const slug = 'CUSTOM_TOOL';
      const body = { userId: 'test-user', arguments: { query: 'test' } };

      // mock client to send back the tool
      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);
      mockClient.toolkits.retrieve.mockResolvedValueOnce(toolkitMocks.rawToolkit);

      // Mock that a custom tool exists
      const getCustomToolBySlugSpy = vi.spyOn(tools['customTools'], 'getCustomToolBySlug');
      getCustomToolBySlugSpy.mockResolvedValueOnce(toolMocks.customTool as unknown as Tool);

      // Mock custom tool execution
      const executeCustomToolSpy = vi.spyOn(tools['customTools'], 'executeCustomTool');
      executeCustomToolSpy.mockResolvedValueOnce(toolMocks.toolExecuteResponse);

      const result = await tools.execute(slug, body);

      expect(getCustomToolBySlugSpy).toHaveBeenCalledWith(slug);
      expect(executeCustomToolSpy).toHaveBeenCalledWith(slug, body, expect.any(Object));
      expect(result).toEqual(toolMocks.toolExecuteResponse);
    });

    it('should execute a composio tool', async () => {
      const slug = 'COMPOSIO_TOOL';
      const body = {
        userId: 'test-user',
        connectedAccountId: undefined,
        arguments: { query: 'test' },
      };

      // mock the connected account
      mockClient.connectedAccounts.list.mockResolvedValueOnce(
        connectedAccountMocks.rawConnectedAccountsResponse
      );

      // Mock that no custom tool exists
      const getCustomToolBySlugSpy = vi.spyOn(tools['customTools'], 'getCustomToolBySlug');
      getCustomToolBySlugSpy.mockResolvedValueOnce(undefined);

      // Mock composio tool retrieval and execution
      const getComposioToolBySlugSpy = vi.spyOn(tools, 'getComposioToolBySlug');
      getComposioToolBySlugSpy.mockResolvedValueOnce(toolMocks.transformedTool as unknown as Tool);

      // Mock the connected account for tool call
      const getConnectedAccountIdForToolSpy = vi.spyOn(
        tools as unknown as {
          getConnectedAccountIdForTool: (typeof tools)['getConnectedAccountIdForTool'];
        },
        'getConnectedAccountIdForTool'
      );
      getConnectedAccountIdForToolSpy.mockResolvedValueOnce('test-connected-account-id');

      mockClient.tools.execute.mockResolvedValueOnce(toolMocks.rawToolExecuteResponse);

      const result = await tools.execute(slug, body);

      expect(getCustomToolBySlugSpy).toHaveBeenCalledWith(slug);
      expect(getComposioToolBySlugSpy).toHaveBeenCalledWith(body.userId, slug);
      expect(getConnectedAccountIdForToolSpy).toHaveBeenCalledWith(body.userId, slug);
      expect(mockClient.tools.execute).toHaveBeenCalledWith(slug, {
        allow_tracing: undefined,
        connected_account_id: undefined,
        custom_auth_params: undefined,
        arguments: body.arguments,
        entity_id: body.userId,
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

      // mock the connected account
      mockClient.connectedAccounts.list.mockResolvedValueOnce(
        connectedAccountMocks.rawConnectedAccountsResponse
      );

      // Mock that no custom tool exists
      const getCustomToolBySlugSpy = vi.spyOn(tools['customTools'], 'getCustomToolBySlug');
      getCustomToolBySlugSpy.mockResolvedValueOnce(undefined);

      // Mock composio tool retrieval and execution
      const getComposioToolBySlugSpy = vi.spyOn(tools, 'getComposioToolBySlug');
      getComposioToolBySlugSpy.mockResolvedValueOnce(toolMocks.transformedTool as unknown as Tool);

      mockClient.tools.execute.mockResolvedValueOnce(toolMocks.rawToolExecuteResponse);

      const result = await tools.execute(slug, body);

      expect(getCustomToolBySlugSpy).toHaveBeenCalledWith(slug);
      expect(getComposioToolBySlugSpy).toHaveBeenCalledWith(body.userId, slug);
      expect(mockClient.tools.execute).toHaveBeenCalledWith(slug, {
        allow_tracing: undefined,
        connected_account_id: 'test-connected-account-id',
        custom_auth_params: undefined,
        arguments: body.arguments,
        entity_id: body.userId,
        version: undefined,
        text: undefined,
      });
      expect(result).toEqual(toolMocks.toolExecuteResponse);
    });

    it('should apply beforeToolExecute and afterToolExecute modifiers', async () => {
      const slug = 'COMPOSIO_TOOL';
      const body = { userId: 'test-user', arguments: { query: 'test' } };
      const modifiers = {
        beforeToolExecute: vi.fn((slug, toolkit, params) => {
          return {
            ...params,
            arguments: { query: 'modified-query' },
          };
        }),
        afterToolExecute: vi.fn((slug, toolkit, response) => {
          return {
            ...response,
            data: {
              ...response.data,
              extraKey: 'modified-results',
            },
          };
        }),
      };

      // Mock that no custom tool exists
      const getCustomToolBySlugSpy = vi.spyOn(tools['customTools'], 'getCustomToolBySlug');
      getCustomToolBySlugSpy.mockResolvedValueOnce(undefined);

      // Mock composio tool retrieval and execution
      const getComposioToolBySlugSpy = vi.spyOn(tools, 'getComposioToolBySlug');
      getComposioToolBySlugSpy.mockResolvedValueOnce(toolMocks.transformedTool as unknown as Tool);

      mockClient.tools.execute.mockResolvedValueOnce(toolMocks.rawToolExecuteResponse);

      const result = await tools.execute(slug, body, modifiers);

      expect(modifiers.beforeToolExecute).toHaveBeenCalled();
      expect(modifiers.afterToolExecute).toHaveBeenCalled();
      expect(mockClient.tools.execute).toHaveBeenCalledWith(slug, {
        entity_id: body.userId,
        connected_account_id: undefined,
        arguments: { query: 'modified-query' },
      });
      expect(result).toEqual({
        ...toolMocks.toolExecuteResponse,
        data: { ...toolMocks.toolExecuteResponse.data, extraKey: 'modified-results' },
      });
    });
  });
});
