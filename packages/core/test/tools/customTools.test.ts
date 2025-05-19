import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomTools } from '../../src/models/CustomTools';
import { mockClient } from '../utils/mocks/client.mock';
import { toolMocks } from '../utils/mocks/data.mock';
import ComposioClient from '@composio/client';
import { z } from 'zod';

describe('CustomTools', () => {
  let customTools: CustomTools;

  const toolOptions = {
    slug: 'CUSTOM_TOOL',
    name: 'Custom Tool',
    description: 'A custom tool for testing',
    inputParams: z.object({
      query: z.string().describe('The search query'),
    }),
    execute: vi.fn().mockResolvedValue(toolMocks.toolExecuteResponse),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    customTools = new CustomTools(mockClient as unknown as ComposioClient);
  });

  it('should throw an error if client is not provided', () => {
    expect(() => new CustomTools(null as any)).toThrow('ComposioClient is required');
  });

  describe('createTool', () => {
    it('should create a custom tool and add it to the registry', async () => {
      const result = await customTools.createTool(toolOptions);

      expect(result).toMatchObject({
        slug: toolOptions.slug,
        name: toolOptions.name,
        description: toolOptions.description,
        inputParameters: expect.any(Object),
        outputParameters: expect.any(Object),
      });

      // Verify it's in the registry
      const registryTool = await customTools.getCustomToolBySlug(toolOptions.slug);
      expect(registryTool).toBeDefined();
      expect(registryTool?.slug).toEqual(toolOptions.slug);
    });

    it('should throw an error for invalid tool options', async () => {
      const invalidOptions = {
        slug: 'INVALID_TOOL',
        // Missing required properties
      };

      await expect(customTools.createTool(invalidOptions as any)).rejects.toThrow(
        'Invalid tool options'
      );
    });
  });

  describe('getCustomTools', () => {
    it('should return all tools from the registry when no slugs provided', async () => {
      // Add tools to the registry
      await customTools.createTool(toolOptions);
      await customTools.createTool({
        ...toolOptions,
        slug: 'ANOTHER_TOOL',
      });

      const result = await customTools.getCustomTools({});

      expect(result).toHaveLength(2);
      expect(result[0].slug).toEqual('CUSTOM_TOOL');
      expect(result[1].slug).toEqual('ANOTHER_TOOL');
    });

    it('should filter tools by slug when provided', async () => {
      // Add tools to the registry
      await customTools.createTool(toolOptions);
      await customTools.createTool({
        ...toolOptions,
        slug: 'ANOTHER_TOOL',
      });

      const result = await customTools.getCustomTools({
        toolSlugs: ['CUSTOM_TOOL'],
      });

      expect(result).toHaveLength(1);
      expect(result[0].slug).toEqual('CUSTOM_TOOL');
    });
  });

  describe('executeCustomTool', () => {
    it('should execute a custom tool with provided parameters', async () => {
      // Add a tool to the registry
      await customTools.createTool(toolOptions);

      const inputParams = { query: 'test query' };
      const metadata = { userId: 'test-user' };

      const result = await customTools.executeCustomTool(toolOptions.slug, inputParams, metadata);

      expect(toolOptions.execute).toHaveBeenCalledWith(inputParams, {}, expect.any(Function));
      expect(result).toEqual(toolMocks.toolExecuteResponse);
    });

    it('should throw an error if tool does not exist', async () => {
      const nonExistentSlug = 'NON_EXISTENT';
      const inputParams = { query: 'test query' };
      const metadata = { userId: 'test-user' };

      await expect(
        customTools.executeCustomTool(nonExistentSlug, inputParams, metadata)
      ).rejects.toThrow(`Tool with slug ${nonExistentSlug} not found`);
    });

    it('should fetch auth credentials for toolkit-based custom tools', async () => {
      // Add a toolkit-based tool
      const toolkitTool = {
        ...toolOptions,
        toolkitSlug: 'TEST_TOOLKIT',
      };
      await customTools.createTool(toolkitTool);

      // Mock toolkit and connected account retrieval
      mockClient.toolkits.retrieve.mockResolvedValueOnce({ slug: 'TEST_TOOLKIT' });
      mockClient.connectedAccounts.list.mockResolvedValueOnce({
        items: [
          {
            id: 'conn-123',
            data: {
              connectionParams: { apiKey: 'test-key' },
            },
          },
        ],
        totalPages: 1,
      });

      const inputParams = { query: 'test query' };
      const metadata = { userId: 'test-user' };

      await customTools.executeCustomTool(toolkitTool.slug, inputParams, metadata);

      expect(toolkitTool.execute).toHaveBeenCalledWith(
        inputParams,
        { apiKey: 'test-key' },
        expect.any(Function)
      );
    });
  });
});
