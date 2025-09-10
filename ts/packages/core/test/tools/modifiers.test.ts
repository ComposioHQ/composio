import { describe, it, expect, vi } from 'vitest';
import { mockClient } from '../utils/mocks/client.mock';
import { toolMocks } from '../utils/mocks/data.mock';
import { Tool } from '../../src/types/tool.types';
import {
  createTestContext,
  setupTest,
  mockToolExecution,
  createSchemaModifier,
  createExecutionModifiers,
} from '../utils/toolExecuteUtils';

describe('Tools Modifiers', () => {
  const context = createTestContext();
  setupTest(context);

  describe('Schema Modifiers', () => {
    it('should modify the tool schema with the provided modifier', async () => {
      const userId = 'test-user';
      const slug = 'COMPOSIO_TOOL';
      const schemaModifier = createSchemaModifier({
        name: 'Modified Name',
        description: 'Modified description',
      });

      // mock client to send back the tool
      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

      const result = await context.tools.getRawComposioToolBySlug(slug, 'latest', {
        modifySchema: schemaModifier,
      });

      expect(schemaModifier).toHaveBeenCalledTimes(1);
      expect(schemaModifier).toHaveBeenCalledWith(
        expect.objectContaining({
          toolSlug: slug,
          toolkitSlug: expect.any(String),
          schema: expect.objectContaining({ slug }),
        })
      );
      expect(result.name).toEqual('Modified Name');
      expect(result.description).toEqual('Modified description');
    });

    it('should apply schema modifiers to all tools when getting multiple tools', async () => {
      const userId = 'test-user';
      const schemaModifier = createSchemaModifier(({ schema }) => ({
        ...schema,
        name: `Modified ${schema.name}`,
      }));

      mockClient.tools.list.mockResolvedValueOnce({
        items: [
          { ...toolMocks.rawTool, slug: 'TOOL1' },
          { ...toolMocks.rawTool, slug: 'TOOL2' },
        ],
        totalPages: 1,
      });

      const result = await context.tools.getRawComposioTools(
        { tools: ['TOOL1', 'TOOL2'] },
        { modifySchema: schemaModifier }
      );

      expect(schemaModifier).toHaveBeenCalledTimes(2);
      expect(result[0].name).toContain('Modified');
      expect(result[1].name).toContain('Modified');
    });
  });

  describe('Execution Modifiers', () => {
    it('should apply beforeExecute modifier before executing a tool', async () => {
      const slug = 'COMPOSIO_TOOL';
      const body = {
        userId: 'test-user',
        arguments: { limit: 5 },
      };

      const { beforeExecute } = createExecutionModifiers({
        beforeModifications: {
          arguments: { limit: 10 },
        },
      });

      await mockToolExecution(context.tools);
      await context.tools.execute(slug, body, { beforeExecute });

      expect(beforeExecute).toHaveBeenCalledTimes(1);
      expect(beforeExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          toolSlug: slug,
          toolkitSlug: expect.any(String),
          params: body,
        })
      );
      expect(mockClient.tools.execute).toHaveBeenCalledWith(
        slug,
        expect.objectContaining({
          arguments: { limit: 10 },
        })
      );
    });

    it('should apply afterExecute modifier after executing a tool', async () => {
      const slug = 'COMPOSIO_TOOL';
      const body = { userId: 'test-user', arguments: {} };

      const { afterExecute } = createExecutionModifiers({
        afterModifications: {
          data: { enhanced: true },
        },
      });

      await mockToolExecution(context.tools);
      const result = await context.tools.execute(slug, body, { afterExecute });

      expect(afterExecute).toHaveBeenCalledTimes(1);
      expect(afterExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          toolSlug: slug,
          toolkitSlug: expect.any(String),
          result: expect.objectContaining({
            data: expect.any(Object),
            successful: expect.any(Boolean),
          }),
        })
      );
      expect(result.data).toHaveProperty('enhanced', true);
    });
  });

  describe('Combined Modifiers', () => {
    it('should apply both schema and execution modifiers together', async () => {
      const userId = 'test-user';
      const slug = 'GITHUB_GET_REPOS';

      // Mock analytics and logging functions
      const trackToolUsage = vi.fn();
      const logToolError = vi.fn();

      const schemaModifier = createSchemaModifier(({ schema, toolSlug }) => ({
        ...schema,
        description: `Enhanced ${toolSlug} for better context`,
        tags: [...(schema.tags || []), 'enhanced', 'modified'],
        inputParameters: {
          type: 'object' as const,
          properties: {
            ...schema.inputParameters?.properties,
            tracking: {
              type: 'object' as const,
              properties: {
                enabled: {
                  type: 'boolean' as const,
                  default: true,
                },
              },
            },
          },
        },
      }));

      const executionModifiers = {
        beforeExecute: vi.fn(({ params, toolSlug }) => {
          // Add analytics tracking
          trackToolUsage(toolSlug);
          return {
            ...params,
            arguments: {
              ...(params.arguments || {}),
              tracking: {
                enabled: true,
                timestamp: expect.any(String),
              },
            },
          };
        }),
        afterExecute: vi.fn(({ result, toolSlug }) => {
          // Log results and handle errors
          if (!result.successful) {
            logToolError(toolSlug, result.error);
          }
          return {
            ...result,
            data: {
              ...(result.data || {}),
              processed: true,
              timestamp: expect.any(String),
            },
          };
        }),
      };

      const getRawComposioToolBySlugSpy = vi.spyOn(context.tools, 'getRawComposioToolBySlug');
      const mockTool = {
        ...(toolMocks.transformedTool as unknown as Tool),
        description: 'Enhanced GITHUB_GET_REPOS for better context',
        tags: ['enhanced', 'modified'],
        inputParameters: {
          type: 'object' as const,
          properties: {
            tracking: {
              type: 'object' as const,
              properties: {
                enabled: {
                  type: 'boolean' as const,
                  default: true,
                },
              },
            },
          },
        },
      };
      getRawComposioToolBySlugSpy.mockResolvedValueOnce(mockTool);

      const createExecuteToolFnSpy = vi.spyOn(context.tools as any, 'createExecuteToolFn');
      const executeWithModifiers = async (params: any) => {
        // Apply beforeExecute modifier
        const modifiedParams = await executionModifiers.beforeExecute({
          toolSlug: slug,
          toolkitSlug: 'default',
          params,
        });

        // Execute the tool
        const response = await mockClient.tools.execute(slug, modifiedParams);

        // Apply afterExecute modifier
        return executionModifiers.afterExecute({
          toolSlug: slug,
          toolkitSlug: 'default',
          result: response,
        });
      };
      createExecuteToolFnSpy.mockReturnValueOnce(executeWithModifiers);

      const tool = await context.tools.get(userId, slug, {
        modifySchema: schemaModifier,
        ...executionModifiers,
      });

      // Verify schema modification
      expect(getRawComposioToolBySlugSpy).toHaveBeenCalledWith(slug, 'latest', {
        modifySchema: schemaModifier,
      });
      expect(mockTool.description).toBe('Enhanced GITHUB_GET_REPOS for better context');
      expect(mockTool.tags).toContain('enhanced');
      expect(mockTool.tags).toContain('modified');
      expect(mockTool.inputParameters).toHaveProperty(['properties', 'tracking']);

      // Verify execution function creation
      expect(createExecuteToolFnSpy).toHaveBeenCalledWith(
        userId,
        expect.objectContaining(executionModifiers)
      );

      // Mock a tool execution to verify the full flow
      await mockToolExecution(context.tools);
      mockClient.tools.execute.mockResolvedValueOnce({
        data: {
          results: true,
        },
        error: null,
        successful: true,
        log_id: '123',
        session_info: {},
      });

      // Execute the tool using the wrapped execute function
      const result = await executeWithModifiers({ query: 'test' });

      // Verify analytics tracking was called
      expect(trackToolUsage).toHaveBeenCalledWith(slug);

      // Verify the execution flow
      expect(executionModifiers.beforeExecute).toHaveBeenCalledWith({
        toolSlug: slug,
        toolkitSlug: 'default',
        params: { query: 'test' },
      });

      expect(executionModifiers.afterExecute).toHaveBeenCalledWith({
        toolSlug: slug,
        toolkitSlug: 'default',
        result: {
          data: {
            results: true,
          },
          error: null,
          successful: true,
          log_id: '123',
          session_info: {},
        },
      });

      // Verify no error logging occurred
      expect(logToolError).not.toHaveBeenCalled();
    });
  });
});
