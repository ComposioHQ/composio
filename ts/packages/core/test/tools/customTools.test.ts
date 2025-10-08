import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomTools } from '../../src/models/CustomTools';
import { mockClient } from '../utils/mocks/client.mock';
import { toolMocks } from '../utils/mocks/data.mock';
import ComposioClient from '@composio/client';
import { z } from 'zod/v3';
import { ComposioToolNotFoundError } from '../../src/errors/ToolErrors';
import { ComposioConnectedAccountNotFoundError } from '../../src/errors/ConnectedAccountsErrors';
import { ValidationError } from '../../src/errors';

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

      await expect(customTools.createTool(invalidOptions as any)).rejects.toThrow(Error);
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
    const executeParams = {
      arguments: { query: 'test query' },
      userId: 'test-user',
    };

    it('should execute a custom tool with provided parameters', async () => {
      // Add a tool to the registry
      await customTools.createTool(toolOptions);

      const result = await customTools.executeCustomTool(toolOptions.slug, executeParams);

      expect(toolOptions.execute).toHaveBeenCalledWith(
        executeParams.arguments,
        null,
        expect.any(Function)
      );
      expect(result).toEqual(toolMocks.toolExecuteResponse);
    });

    it('should throw an error if tool does not exist', async () => {
      const nonExistentSlug = 'NON_EXISTENT';

      await expect(customTools.executeCustomTool(nonExistentSlug, executeParams)).rejects.toThrow(
        ComposioToolNotFoundError
      );
    });

    it('should throw validation error for invalid input parameters', async () => {
      await customTools.createTool(toolOptions);
      const invalidParams = {
        ...executeParams,
        arguments: { invalidField: 'test' },
      };

      await expect(customTools.executeCustomTool(toolOptions.slug, invalidParams)).rejects.toThrow(
        ValidationError
      );
    });

    describe('toolkit-based custom tools', () => {
      const toolkitTool = {
        ...toolOptions,
        toolkitSlug: 'TEST_TOOLKIT',
      };

      const mockConnectedAccount = {
        id: 'conn-123',
        auth_config: {
          id: 'auth-123',
          auth_scheme: 'OAUTH2',
          is_composio_managed: true,
          is_disabled: false,
        },
        user_id: 'test-user',
        data: {},
        state: {
          authScheme: 'OAUTH2',
          val: {
            status: 'ACTIVE',
            access_token: 'test-token',
            token_type: 'Bearer',
          },
        },
        status: 'ACTIVE',
        status_reason: null,
        toolkit: {
          slug: 'TEST_TOOLKIT',
        },
        test_request_endpoint: 'https://api.test.com',
        is_disabled: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      beforeEach(async () => {
        await customTools.createTool(toolkitTool);
        mockClient.toolkits.retrieve.mockResolvedValue({ slug: 'TEST_TOOLKIT' });
      });

      it('should fetch and use auth credentials for toolkit-based custom tools', async () => {
        mockClient.connectedAccounts.list.mockResolvedValueOnce({
          items: [mockConnectedAccount],
          totalPages: 1,
        });

        await customTools.executeCustomTool(toolkitTool.slug, executeParams);

        expect(toolkitTool.execute).toHaveBeenCalledWith(
          executeParams.arguments,
          mockConnectedAccount.state,
          expect.any(Function)
        );
      });

      it('should use specified connected account when connectedAccountId is provided', async () => {
        const specificConnectedAccountId = 'conn-456';
        const specificConnectedAccount = {
          ...mockConnectedAccount,
          id: specificConnectedAccountId,
        };

        mockClient.connectedAccounts.list.mockResolvedValueOnce({
          items: [mockConnectedAccount, specificConnectedAccount],
          totalPages: 1,
        });

        await customTools.executeCustomTool(toolkitTool.slug, {
          ...executeParams,
          connectedAccountId: specificConnectedAccountId,
        });

        expect(toolkitTool.execute).toHaveBeenCalledWith(
          executeParams.arguments,
          specificConnectedAccount.state,
          expect.any(Function)
        );
      });

      it('should throw error when toolkit is not found', async () => {
        mockClient.toolkits.retrieve.mockRejectedValueOnce(new Error('Toolkit not found'));

        await expect(
          customTools.executeCustomTool(toolkitTool.slug, executeParams)
        ).rejects.toThrow(ComposioToolNotFoundError);
      });

      it('should throw error when no connected accounts are found', async () => {
        mockClient.connectedAccounts.list.mockResolvedValueOnce({
          items: [],
          totalPages: 1,
        });

        await expect(
          customTools.executeCustomTool(toolkitTool.slug, executeParams)
        ).rejects.toThrow(ComposioConnectedAccountNotFoundError);
      });

      it('should throw error when specified connected account is not found', async () => {
        mockClient.connectedAccounts.list.mockResolvedValueOnce({
          items: [mockConnectedAccount],
          totalPages: 1,
        });

        await expect(
          customTools.executeCustomTool(toolkitTool.slug, {
            ...executeParams,
            connectedAccountId: 'non-existent-id',
          })
        ).rejects.toThrow(ComposioConnectedAccountNotFoundError);
      });

      it('should throw error when trying to use executeToolRequest with custom toolkit', async () => {
        const customToolkitTool = {
          ...toolOptions,
          toolkitSlug: 'custom',
          execute: async (input: any, auth: any, executeToolRequest: any) => {
            return executeToolRequest({ slug: 'TEST_TOOL', arguments: {} });
          },
        };

        await customTools.createTool(customToolkitTool);

        await expect(
          customTools.executeCustomTool(customToolkitTool.slug, executeParams)
        ).rejects.toThrow(
          'Custom tools without a toolkit cannot be executed using the executeToolRequest function'
        );
      });
    });
  });
});
