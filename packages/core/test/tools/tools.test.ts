import { describe, it, expect, vi } from 'vitest';
import { mockClient } from '../utils/mocks/client.mock';
import { toolMocks } from '../utils/mocks/data.mock';
import { Tool } from '../../src/types/tool.types';
import { Tools } from '../../src/models/Tools';
import ComposioClient from '@composio/client';
import {
  createTestContext,
  setupTest,
  mockToolExecution,
  createSchemaModifier,
} from '../utils/toolExecuteUtils';

describe('Tools', () => {
  const context = createTestContext();
  setupTest(context);

  describe('constructor', () => {
    it('should throw an error if client is not provided', () => {
      expect(() => new Tools(null as any, context.mockToolset)).toThrow(
        'ComposioClient is required'
      );
    });

    it('should throw an error if toolset is not provided', () => {
      expect(() => new Tools(mockClient as unknown as ComposioClient, null as any)).toThrow(
        'Toolset not passed into Tools instance'
      );
    });

    it('should create an instance successfully with valid parameters', () => {
      expect(context.tools).toBeInstanceOf(Tools);
    });
  });

  describe('getComposioTools', () => {
    it('should fetch tools from the API', async () => {
      const userId = 'test-user';

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      const result = await context.tools.getComposioTools(userId);

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

      await context.tools.getComposioTools(userId, query);

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

      const result = await context.tools.getComposioTools(userId);

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

      const result = await context.tools.getComposioTools(userId);

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

      const result = await context.tools.getComposioTools(userId, {}, schemaModifier);

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

      await expect(context.tools.getComposioTools(userId, {}, invalidModifier)).rejects.toThrow(
        'Invalid schema modifier. Not a function.'
      );
    });
  });

  describe('getComposioToolBySlug', () => {
    it('should fetch a tool by slug from the API', async () => {
      const userId = 'test-user';
      const slug = 'TOOL_SLUG';

      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

      const result = await context.tools.getComposioToolBySlug(userId, slug);

      expect(mockClient.tools.retrieve).toHaveBeenCalledWith(slug);
      expect(result.slug).toEqual(toolMocks.transformedTool.slug);
    });

    it('should check for custom tools first', async () => {
      const userId = 'test-user';
      const slug = 'CUSTOM_TOOL';

      const getCustomToolBySlugSpy = vi.spyOn(context.tools['customTools'], 'getCustomToolBySlug');
      getCustomToolBySlugSpy.mockResolvedValueOnce(toolMocks.customTool as unknown as Tool);

      const result = await context.tools.getComposioToolBySlug(userId, slug);

      expect(getCustomToolBySlugSpy).toHaveBeenCalledWith(slug);
      expect(mockClient.tools.retrieve).not.toHaveBeenCalled();
      expect(result.slug).toEqual(toolMocks.customTool.slug);
    });

    it('should throw an error if tool is not found', async () => {
      const userId = 'test-user';
      const slug = 'NONEXISTENT_TOOL';

      const getCustomToolBySlugSpy = vi.spyOn(context.tools['customTools'], 'getCustomToolBySlug');
      getCustomToolBySlugSpy.mockResolvedValueOnce(undefined);
      mockClient.tools.retrieve.mockResolvedValueOnce(null);

      await expect(context.tools.getComposioToolBySlug(userId, slug)).rejects.toThrow(
        `Tool with slug ${slug} not found`
      );
    });

    it('should apply schema modifiers when provided', async () => {
      const userId = 'test-user';
      const slug = 'TOOL_SLUG';
      const schemaModifier = createSchemaModifier({
        description: 'Modified description',
      });

      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

      const result = await context.tools.getComposioToolBySlug(userId, slug, schemaModifier);

      expect(schemaModifier).toHaveBeenCalled();
      expect(result.description).toEqual('Modified description');
    });
  });

  describe('get', () => {
    it('should get a single tool and wrap it with toolset', async () => {
      const userId = 'test-user';
      const slug = 'TOOL_SLUG';

      const getComposioToolBySlugSpy = vi.spyOn(context.tools, 'getComposioToolBySlug');
      getComposioToolBySlugSpy.mockResolvedValueOnce(toolMocks.transformedTool as unknown as Tool);

      context.mockToolset.wrapTool.mockReturnValueOnce('wrapped-tool');

      const result = await context.tools.get(userId, slug);

      expect(getComposioToolBySlugSpy).toHaveBeenCalledWith(userId, slug, undefined);
      expect(context.mockToolset.wrapTool).toHaveBeenCalled();
      expect(result).toEqual('wrapped-tool');
    });

    it('should get multiple tools and wrap them with toolset', async () => {
      const userId = 'test-user';
      const filters = { tools: ['TOOL1', 'TOOL2'] };

      const getComposioToolsSpy = vi.spyOn(context.tools, 'getComposioTools');
      getComposioToolsSpy.mockResolvedValueOnce([toolMocks.transformedTool as unknown as Tool]);

      context.mockToolset.wrapTools.mockReturnValueOnce('wrapped-tools');

      const result = await context.tools.get(userId, filters);

      expect(getComposioToolsSpy).toHaveBeenCalledWith(userId, filters, undefined);
      expect(context.mockToolset.wrapTools).toHaveBeenCalled();
      expect(result).toEqual('wrapped-tools');
    });

    it('should pass modifiers to the underlying methods', async () => {
      const userId = 'test-user';
      const slug = 'TOOL_SLUG';
      const schemaModifier = createSchemaModifier({
        description: 'Modified description',
      });

      const getComposioToolBySlugSpy = vi.spyOn(context.tools, 'getComposioToolBySlug');
      getComposioToolBySlugSpy.mockResolvedValueOnce(toolMocks.transformedTool as unknown as Tool);

      await context.tools.get(userId, slug, { modifyToolSchema: schemaModifier });

      expect(getComposioToolBySlugSpy).toHaveBeenCalledWith(userId, slug, schemaModifier);
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

      await mockToolExecution(context.tools);

      const result = await context.tools.execute(slug, body);

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

      await mockToolExecution(context.tools);

      const result = await context.tools.execute(slug, body);

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
  });
});
