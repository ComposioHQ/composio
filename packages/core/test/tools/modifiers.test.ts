import { describe, it, expect, vi } from 'vitest';
import { mockClient } from './mocks/client.mock';
import { toolMocks } from './mocks/data.mock';
import { Tool } from '../../src/types/tool.types';
import {
  createTestContext,
  setupTest,
  mockToolExecution,
  createSchemaModifier,
  createExecutionModifiers,
} from './test-utils';

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

      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

      const result = await context.tools.getComposioToolBySlug(userId, slug, schemaModifier);

      expect(schemaModifier).toHaveBeenCalledTimes(1);
      expect(schemaModifier).toHaveBeenCalledWith(
        slug,
        expect.any(String),
        expect.objectContaining({ slug })
      );
      expect(result.name).toEqual('Modified Name');
      expect(result.description).toEqual('Modified description');
    });

    it('should apply schema modifiers to all tools when getting multiple tools', async () => {
      const userId = 'test-user';
      const schemaModifier = createSchemaModifier((tool: Tool) => ({
        ...tool,
        name: `Modified ${tool.name}`,
      }));

      mockClient.tools.list.mockResolvedValueOnce({
        items: [
          { ...toolMocks.rawTool, slug: 'TOOL1' },
          { ...toolMocks.rawTool, slug: 'TOOL2' },
        ],
        totalPages: 1,
      });

      const result = await context.tools.getComposioTools(userId, {}, schemaModifier);

      expect(schemaModifier).toHaveBeenCalledTimes(2);
      expect(result[0].name).toContain('Modified');
      expect(result[1].name).toContain('Modified');
    });
  });

  describe('Execution Modifiers', () => {
    it('should apply beforeToolExecute modifier before executing a tool', async () => {
      const slug = 'COMPOSIO_TOOL';
      const body = {
        userId: 'test-user',
        arguments: { limit: 5 },
      };

      const { beforeToolExecute } = createExecutionModifiers({
        beforeModifications: {
          arguments: { limit: 10 },
        },
      });

      await mockToolExecution(context.tools);
      await context.tools.execute(slug, body, { beforeToolExecute });

      expect(beforeToolExecute).toHaveBeenCalledTimes(1);
      expect(beforeToolExecute).toHaveBeenCalledWith(slug, expect.any(String), body);
      expect(mockClient.tools.execute).toHaveBeenCalledWith(
        slug,
        expect.objectContaining({
          arguments: { limit: 10 },
        })
      );
    });

    it('should apply afterToolExecute modifier after executing a tool', async () => {
      const slug = 'COMPOSIO_TOOL';
      const body = { userId: 'test-user', arguments: {} };

      const { afterToolExecute } = createExecutionModifiers({
        afterModifications: {
          data: { enhanced: true },
        },
      });

      await mockToolExecution(context.tools);
      const result = await context.tools.execute(slug, body, { afterToolExecute });

      expect(afterToolExecute).toHaveBeenCalledTimes(1);
      expect(afterToolExecute).toHaveBeenCalledWith(
        slug,
        expect.any(String),
        expect.objectContaining({
          data: expect.any(Object),
          successful: expect.any(Boolean),
        })
      );
      expect(result.data).toHaveProperty('enhanced', true);
    });
  });

  describe('Combined Modifiers', () => {
    it('should apply both schema and execution modifiers together', async () => {
      const userId = 'test-user';
      const slug = 'COMPOSIO_TOOL';

      const schemaModifier = createSchemaModifier({
        description: 'Modified schema',
      });

      const executionModifiers = createExecutionModifiers();

      const getComposioToolBySlugSpy = vi.spyOn(context.tools, 'getComposioToolBySlug');
      getComposioToolBySlugSpy.mockResolvedValueOnce({
        ...(toolMocks.transformedTool as unknown as Tool),
        description: 'Modified schema',
      });

      const createExecuteToolFnSpy = vi.spyOn(context.tools as any, 'createExecuteToolFn');

      await context.tools.get(userId, slug, {
        modifyToolSchema: schemaModifier,
        ...executionModifiers,
      });

      expect(getComposioToolBySlugSpy).toHaveBeenCalledWith(userId, slug, schemaModifier);
      expect(createExecuteToolFnSpy).toHaveBeenCalledWith(
        userId,
        expect.objectContaining(executionModifiers)
      );
    });
  });
});
