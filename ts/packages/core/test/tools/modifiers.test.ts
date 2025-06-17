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

      const result = await context.tools.getRawComposioToolBySlug(userId, slug, schemaModifier);

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

      const result = await context.tools.getRawComposioTools(
        userId,
        { tools: ['TOOL1', 'TOOL2'] },
        schemaModifier
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
      expect(beforeExecute).toHaveBeenCalledWith(slug, expect.any(String), body);
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

      const getRawComposioToolBySlugSpy = vi.spyOn(context.tools, 'getRawComposioToolBySlug');
      getRawComposioToolBySlugSpy.mockResolvedValueOnce({
        ...(toolMocks.transformedTool as unknown as Tool),
        description: 'Modified schema',
      });

      const createExecuteToolFnSpy = vi.spyOn(context.tools as any, 'createExecuteToolFn');

      await context.tools.get(userId, slug, {
        modifySchema: schemaModifier,
        ...executionModifiers,
      });

      expect(getRawComposioToolBySlugSpy).toHaveBeenCalledWith(userId, slug, schemaModifier);
      expect(createExecuteToolFnSpy).toHaveBeenCalledWith(
        userId,
        expect.objectContaining(executionModifiers)
      );
    });
  });
});
