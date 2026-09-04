import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockClient } from '../utils/mocks/client.mock';
import { toolMocks } from '../utils/mocks/data.mock';
import { Tool, ToolListParams, ToolExecuteParams } from '../../src/types/tool.types';
import { ExecuteToolFn } from '../../src/types/provider.types';
import { Tools } from '../../src/models/Tools';
import {
  createTestContext,
  setupTest,
  mockToolExecution,
  createSchemaModifier,
} from '../utils/toolExecuteUtils';
import { MockProvider } from '../utils/mocks/provider.mock';
import { ValidationError } from '../../src/errors/ValidationErrors';

// Minimal structural shape for a ComposioError-like value (possibly wrapping
// another error as its `cause`), used to narrow `catch (error: unknown)`
// blocks that assert on `.code` / `.message` / `.possibleFixes`.
type ErrorWithPossibleFixes = {
  code?: string;
  message?: string;
  possibleFixes?: string[];
  cause?: {
    code?: string;
    message?: string;
    possibleFixes?: string[];
  };
};

describe('Tools', () => {
  const context = createTestContext();
  setupTest(context);

  describe('constructor', () => {
    it('should throw an error if client is not provided', () => {
      expect(() => new Tools(null as unknown, { provider: context.mockProvider })).toThrow(
        'ComposioClient is required'
      );
    });

    it('should throw an error if provider is not provided', () => {
      expect(() => new Tools(mockClient, null as unknown)).toThrow(
        'Provider not passed into Tools instance'
      );
    });

    it('should create an instance successfully with valid parameters', () => {
      expect(context.tools).toBeInstanceOf(Tools);
    });
  });

  describe('getRawComposioTools', () => {
    it('should fetch tools from the API', async () => {
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
      const query = {
        tools: ['TOOL1', 'TOOL2'],
      };

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      await context.tools.getRawComposioTools(query);

      expect(mockClient.tools.list).toHaveBeenCalledWith(
        {
          tool_slugs: 'TOOL1,TOOL2',
          limit: 9999,
          toolkit_versions: 'latest',
        },
        undefined
      );
    });

    it('should handle toolkit query parameters correctly', async () => {
      const query = {
        toolkits: ['github'],
      };

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      await context.tools.getRawComposioTools(query);

      expect(mockClient.tools.list).toHaveBeenCalledWith(
        {
          toolkit_slug: 'github',
          important: 'true',
          toolkit_versions: 'latest',
        },
        undefined
      );
    });

    it('should respect explicit important=false to opt-out', async () => {
      const query = {
        toolkits: ['github'],
        important: false,
        limit: 10,
      };

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      await context.tools.getRawComposioTools(query);

      expect(mockClient.tools.list).toHaveBeenCalledWith(
        {
          toolkit_slug: 'github',
          limit: 10,
          toolkit_versions: 'latest',
        },
        undefined
      );
    });

    it('should handle toolkit search parameters correctly', async () => {
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

      expect(mockClient.tools.list).toHaveBeenCalledWith(
        {
          toolkit_slug: 'github',
          limit: 10,
          search: 'test',
          toolkit_versions: 'latest',
        },
        undefined
      );
    });

    it('should handle toolkit scopes parameters correctly', async () => {
      const query: ToolListParams = {
        toolkits: ['todoist'],
        scopes: ['task:add', 'task:read'],
      };

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      await context.tools.getRawComposioTools(query);

      expect(mockClient.tools.list).toHaveBeenCalledWith(
        {
          toolkit_slug: 'todoist',
          important: 'true',
          scopes: ['task:add', 'task:read'],
          toolkit_versions: 'latest',
        },
        undefined
      );
    });

    it('should handle toolkit scopes with search parameters correctly', async () => {
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

      expect(mockClient.tools.list).toHaveBeenCalledWith(
        {
          toolkit_slug: 'todoist',
          limit: 10,
          search: 'add task',
          scopes: ['task:add'],
          toolkit_versions: 'latest',
        },
        undefined
      );
    });

    it('should respect explicit important=true', async () => {
      const query: ToolListParams = {
        toolkits: ['github'],
        important: true,
        limit: 10,
      };

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      await context.tools.getRawComposioTools(query);

      expect(mockClient.tools.list).toHaveBeenCalledWith(
        {
          toolkit_slug: 'github',
          important: 'true',
          limit: 10,
          toolkit_versions: 'latest',
        },
        undefined
      );
    });

    it('should NOT auto-apply important when tags are passed with values', async () => {
      const query: ToolListParams = {
        toolkits: ['github'],
        tags: ['important', 'custom'],
        limit: 10,
      };

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      await context.tools.getRawComposioTools(query);

      expect(mockClient.tools.list).toHaveBeenCalledWith(
        {
          toolkit_slug: 'github',
          tags: ['important', 'custom'],
          limit: 10,
          toolkit_versions: 'latest',
        },
        undefined
      );
      // Should NOT include important: 'true' when tags are provided
    });

    it('should NOT auto-apply important when tags are passed as empty array', async () => {
      const query: ToolListParams = {
        toolkits: ['github'],
        tags: [],
      };

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      await context.tools.getRawComposioTools(query);

      expect(mockClient.tools.list).toHaveBeenCalledWith(
        {
          toolkit_slug: 'github',
          tags: [],
          toolkit_versions: 'latest',
        },
        undefined
      );
      // Should NOT include important: 'true' when tags array is present (even if empty)
    });

    it('should NOT auto-apply important when limit is provided', async () => {
      const query: ToolListParams = {
        toolkits: ['github'],
        limit: 10,
      };

      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      await context.tools.getRawComposioTools(query);

      expect(mockClient.tools.list).toHaveBeenCalledWith(
        {
          toolkit_slug: 'github',
          limit: 10,
          toolkit_versions: 'latest',
        },
        undefined
      );
      // Should NOT include important: 'true' when limit is provided
    });

    it('should throw a validation error when scopes are provided without toolkits', async () => {
      const invalidQuery = {
        scopes: ['task:add'],
      } as unknown;

      await expect(context.tools.getRawComposioTools(invalidQuery)).rejects.toThrow(
        'Invalid tool list parameters'
      );
    });

    it('should transform tool case correctly', async () => {
      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.rawTool],
        totalPages: 1,
      });

      const result = await context.tools.getRawComposioTools({ tools: ['TEST_TOOL'] });

      expect(result[0].inputParameters).toEqual(toolMocks.transformedTool.inputParameters);
      expect(result[0].outputParameters).toEqual(toolMocks.transformedTool.outputParameters);
    });

    it('should apply schema modifiers when provided', async () => {
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
      const invalidModifier = 'not a function' as unknown;

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
      const invalidQuery = {
        tools: ['TOOL1'],
        toolkits: ['github'],
      } as unknown;

      await expect(context.tools.getRawComposioTools(invalidQuery)).rejects.toThrow(
        'Invalid tool list parameters'
      );
    });

    it('should throw a validation error when no required parameters are provided', async () => {
      const emptyQuery = {} as unknown;

      await expect(context.tools.getRawComposioTools(emptyQuery)).rejects.toThrow(ValidationError);
    });
  });

  describe('getRawToolRouterSessionTools', () => {
    it('should fetch all paginated session tool pages', async () => {
      mockClient.toolRouter.session.tools
        .mockResolvedValueOnce({
          items: [{ ...toolMocks.rawTool, slug: 'FIRST_TOOL' }],
          next_cursor: 'next_page',
        })
        .mockResolvedValueOnce({
          items: [{ ...toolMocks.rawTool, slug: 'SECOND_TOOL' }],
          next_cursor: null,
        });

      const result = await context.tools.getRawToolRouterSessionTools('session_123');

      expect(result.map(tool => tool.slug)).toEqual(['FIRST_TOOL', 'SECOND_TOOL']);
      expect(mockClient.toolRouter.session.tools).toHaveBeenNthCalledWith(
        1,
        'session_123',
        {
          limit: 500,
        },
        undefined
      );
      expect(mockClient.toolRouter.session.tools).toHaveBeenNthCalledWith(
        2,
        'session_123',
        {
          limit: 500,
          cursor: 'next_page',
        },
        undefined
      );
    });

    it('should pass unknown toolkit metadata to schema modifiers', async () => {
      const toolWithoutToolkit = {
        ...toolMocks.rawTool,
        toolkit: undefined,
      };
      const modifySchema = vi.fn(({ schema }) => schema);
      mockClient.toolRouter.session.tools.mockResolvedValueOnce({
        items: [toolWithoutToolkit],
        next_cursor: null,
      });

      await context.tools.getRawToolRouterSessionTools('session_123', { modifySchema });

      expect(modifySchema).toHaveBeenCalledWith({
        toolSlug: toolMocks.rawTool.slug,
        toolkitSlug: 'unknown',
        schema: expect.objectContaining({ slug: toolMocks.rawTool.slug }),
      });
    });
  });

  describe('getRawComposioToolBySlug', () => {
    it('should fetch a tool by slug from the API', async () => {
      const slug = 'TOOL_SLUG';

      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

      const result = await context.tools.getRawComposioToolBySlug(slug);

      expect(mockClient.tools.retrieve).toHaveBeenCalledWith(
        slug,
        { toolkit_versions: 'latest' },
        undefined
      );
      expect(result.slug).toEqual(toolMocks.transformedTool.slug);
    });

    it('should throw an error if tool is not found', async () => {
      const slug = 'NONEXISTENT_TOOL';

      mockClient.tools.retrieve.mockRejectedValue(null);

      await expect(context.tools.getRawComposioToolBySlug(slug)).rejects.toThrow(
        `Unable to retrieve tool with slug ${slug}`
      );
    });

    it('should apply schema modifiers when provided', async () => {
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

    it('should use version parameter when provided (explicit version string)', async () => {
      const slug = 'GITHUB_CREATE_ISSUE';
      const explicitVersion = '20250909_00';

      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

      await context.tools.getRawComposioToolBySlug(slug, {
        version: explicitVersion,
      });

      // Should use 'version' param, not 'toolkit_versions'
      expect(mockClient.tools.retrieve).toHaveBeenCalledWith(
        slug,
        {
          version: explicitVersion,
        },
        undefined
      );
    });

    it('should use version parameter when provided (latest string)', async () => {
      const slug = 'GITHUB_CREATE_ISSUE';

      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

      await context.tools.getRawComposioToolBySlug(slug, {
        version: 'latest',
      });

      // Should use 'version' param with 'latest'
      expect(mockClient.tools.retrieve).toHaveBeenCalledWith(
        slug,
        {
          version: 'latest',
        },
        undefined
      );
    });

    it('should use version parameter when provided (version mapping object)', async () => {
      const slug = 'GITHUB_CREATE_ISSUE';
      const versionMapping = { github: '20250909_00', slack: 'latest' };

      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

      // Create a Tools instance with SDK-level toolkitVersions as mapping object
      const toolsWithVersions = new Tools(mockClient, {
        provider: context.mockProvider,
        toolkitVersions: versionMapping,
      });

      await toolsWithVersions.getRawComposioToolBySlug(slug);

      // Should use 'toolkit_versions' param with mapping object (not 'version')
      expect(mockClient.tools.retrieve).toHaveBeenCalledWith(
        slug,
        {
          toolkit_versions: versionMapping,
        },
        undefined
      );
    });

    it('should fallback to SDK toolkitVersions when version not provided', async () => {
      const slug = 'GITHUB_CREATE_ISSUE';

      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

      // Call without version option
      await context.tools.getRawComposioToolBySlug(slug);

      // Should use 'toolkit_versions' param with SDK-level config
      expect(mockClient.tools.retrieve).toHaveBeenCalledWith(
        slug,
        {
          toolkit_versions: 'latest',
        },
        undefined
      );
    });

    it('should prioritize explicit version over SDK toolkitVersions', async () => {
      const slug = 'GITHUB_CREATE_ISSUE';
      const explicitVersion = '20250909_00';

      // Create a Tools instance with SDK-level toolkitVersions
      const toolsWithVersions = new Tools(mockClient, {
        provider: context.mockProvider,
        toolkitVersions: { github: explicitVersion },
      });

      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

      await toolsWithVersions.getRawComposioToolBySlug(slug, {
        version: explicitVersion,
      });

      // Explicit version should take precedence, using 'version' param
      expect(mockClient.tools.retrieve).toHaveBeenCalledWith(
        slug,
        {
          version: explicitVersion,
        },
        undefined
      );
    });

    it('should support combining version and modifySchema options', async () => {
      const slug = 'GITHUB_CREATE_ISSUE';
      const explicitVersion = '20250909_00';
      const schemaModifier = createSchemaModifier({
        description: 'Modified description',
      });

      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

      const result = await context.tools.getRawComposioToolBySlug(slug, {
        version: explicitVersion,
        modifySchema: schemaModifier,
      });

      // Should use version param
      expect(mockClient.tools.retrieve).toHaveBeenCalledWith(
        slug,
        {
          version: explicitVersion,
        },
        undefined
      );
      // Should also apply schema modifier
      expect(schemaModifier).toHaveBeenCalled();
      expect(result.description).toEqual('Modified description');
    });
  });

  // MCP-backed toolkits (granola_mcp, apify_mcp, tavily_mcp, …) have no
  // declared output schema, so the Composio API returns
  // output_parameters: {}. Before the fix, transformToolCases ran that
  // through ParametersSchema (which requires { type: 'object', properties:
  // {...} }) and threw a ZodError, breaking every tools.execute /
  // tools.list call for these toolkits. See
  // https://github.com/ComposioHQ/composio/issues/3354.
  describe('MCP-shaped tool metadata', () => {
    it('should normalize output_parameters: {} to undefined on the transformed Tool', async () => {
      const slug = 'GRANOLA_MCP_LIST_MEETINGS';
      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.mcpRawTool);

      const tool = await context.tools.getRawComposioToolBySlug(slug);

      expect(tool.outputParameters).toBeUndefined();
      expect(tool.inputParameters).toEqual(toolMocks.mcpRawTool.input_parameters);
    });

    it('should normalize both empty input and output parameters to undefined', async () => {
      const slug = 'SOME_MCP_PING';
      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.mcpRawToolBothEmpty);

      const tool = await context.tools.getRawComposioToolBySlug(slug);

      expect(tool.inputParameters).toBeUndefined();
      expect(tool.outputParameters).toBeUndefined();
    });

    it('should also tolerate empty output_parameters in tools.list responses', async () => {
      mockClient.tools.list.mockResolvedValueOnce({
        items: [toolMocks.mcpRawTool],
        totalPages: 1,
      });

      const result = await context.tools.getRawComposioTools({ toolkits: ['granola_mcp'] });

      expect(result).toHaveLength(1);
      expect(result[0].slug).toEqual('GRANOLA_MCP_LIST_MEETINGS');
      expect(result[0].outputParameters).toBeUndefined();
      expect(result[0].inputParameters).toEqual(toolMocks.mcpRawTool.input_parameters);
    });

    it('should execute an MCP tool whose metadata has empty output_parameters', async () => {
      // End-to-end: tools.execute → getRawComposioToolBySlug →
      // transformToolCases → executeComposioTool → client.tools.execute.
      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.mcpRawTool);
      mockClient.tools.execute.mockResolvedValueOnce(toolMocks.rawToolExecuteResponse);

      const result = await context.tools.execute('GRANOLA_MCP_LIST_MEETINGS', {
        userId: 'pg-test-9f4d0df7-a59d-4341-ad00-887b2c58004b',
        arguments: { time_range: 'last_30_days' },
        version: '20260206_00',
      });

      expect(mockClient.tools.execute).toHaveBeenCalledTimes(1);
      expect(result).toEqual(toolMocks.toolExecuteResponse);
    });
  });

  // `ParametersSchema` is a strict `z.object`, so any key it doesn't declare is
  // dropped on parse. It previously omitted `$defs`/`definitions`, so a tool
  // whose parameters root carries those blocks (the `$ref` targets) lost them —
  // leaving every nested `$ref` dangling and unresolvable for providers and the
  // file modifier. See https://github.com/ComposioHQ/composio/issues/3506.
  describe('$ref / $defs preservation on tool parameters', () => {
    const rawToolWithDefs = {
      slug: 'GMAIL_GET_ATTACHMENT',
      name: 'Get Attachment',
      description: 'Fetch a Gmail attachment',
      input_parameters: {
        type: 'object',
        properties: {
          message_id: { type: 'string' },
        },
      },
      output_parameters: {
        type: 'object',
        properties: {
          data: { $ref: '#/$defs/GetAttachmentResponse' },
          legacy_data: { $ref: '#/definitions/LegacyAttachmentResponse' },
        },
        $defs: {
          GetAttachmentResponse: {
            type: 'object',
            properties: { file: { $ref: '#/$defs/FileDownloadable' } },
          },
          FileDownloadable: {
            type: 'object',
            file_downloadable: true,
            properties: { s3url: { type: 'string' } },
          },
        },
        definitions: {
          LegacyAttachmentResponse: {
            type: 'object',
            properties: { file: { $ref: '#/definitions/LegacyFileDownloadable' } },
          },
          LegacyFileDownloadable: {
            type: 'object',
            file_downloadable: true,
            properties: { s3url: { type: 'string' } },
          },
        },
      },
      toolkit: { logo: 'https://example.com/gmail.png', slug: 'gmail', name: 'Gmail' },
      version: '20260515_00',
    };

    it('keeps the root $defs block so nested $ref pointers stay resolvable', async () => {
      mockClient.tools.retrieve.mockResolvedValueOnce(rawToolWithDefs);

      const tool = await context.tools.getRawComposioToolBySlug('GMAIL_GET_ATTACHMENT');

      expect(tool.outputParameters?.$defs).toBeDefined();
      expect(tool.outputParameters?.$defs?.FileDownloadable).toMatchObject({
        file_downloadable: true,
      });
      expect(tool.outputParameters?.definitions?.LegacyFileDownloadable).toMatchObject({
        file_downloadable: true,
      });
      expect(tool.outputParameters?.properties?.data).toEqual({
        $ref: '#/$defs/GetAttachmentResponse',
      });
      expect(tool.outputParameters?.properties?.legacy_data).toEqual({
        $ref: '#/definitions/LegacyAttachmentResponse',
      });
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

      expect(getRawComposioToolBySlugSpy).toHaveBeenCalledWith(slug, undefined, undefined);
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

      expect(getRawComposioToolsSpy).toHaveBeenCalledWith(filters, undefined, undefined);
      expect(context.mockProvider.wrapTools).toHaveBeenCalled();
      expect(result).toEqual('wrapped-tools-collection');
    });

    it('should apply schema modifiers before wrapping tools for the provider', async () => {
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

      expect(getRawComposioToolBySlugSpy).toHaveBeenCalledWith(slug, undefined, undefined);
      expect(schemaModifier).toHaveBeenCalledOnce();
      expect(context.mockProvider.wrapTools).toHaveBeenCalledWith(
        [expect.objectContaining({ description: 'Modified description' })],
        expect.any(Function)
      );
    });

    it('should reject an invalid schema modifier when no tools are returned', async () => {
      const invalidModifier = 'not a function' as unknown;
      vi.spyOn(context.tools, 'getRawComposioTools').mockResolvedValueOnce([]);

      await expect(
        context.tools.get('test-user', { toolkits: ['github'] }, { modifySchema: invalidModifier })
      ).rejects.toThrow('Invalid schema modifier. Not a function.');
    });
  });

  describe('execute', () => {
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

      expect(mockClient.tools.execute).toHaveBeenCalledWith(
        slug,
        {
          allow_tracing: undefined,
          connected_account_id: undefined,
          custom_auth_params: undefined,
          custom_connection_data: undefined,
          arguments: body.arguments,
          user_id: body.userId,
          version: 'latest',
          text: undefined,
        },
        undefined
      );
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

      expect(mockClient.tools.execute).toHaveBeenCalledWith(
        slug,
        {
          allow_tracing: undefined,
          connected_account_id: 'test-connected-account-id',
          custom_auth_params: undefined,
          custom_connection_data: undefined,
          arguments: body.arguments,
          user_id: body.userId,
          version: 'latest',
          text: undefined,
        },
        undefined
      );
      expect(result).toEqual(toolMocks.toolExecuteResponse);
    });

    it('should transform customAuthParams.baseURL to base_url when executing a tool', async () => {
      const slug = 'COMPOSIO_TOOL';
      const body = {
        userId: 'test-user',
        connectedAccountId: 'test-connected-account-id',
        arguments: { query: 'test' },
        dangerouslySkipVersionCheck: true,
        customAuthParams: {
          baseURL: 'https://custom-api.example.com',
          parameters: [{ name: 'x-api-key', value: 'test-key', in: 'header' as const }],
          body: { extra: 'data' },
        },
      };

      await mockToolExecution(context.tools);

      const result = await context.tools.execute(slug, body);

      expect(mockClient.tools.execute).toHaveBeenCalledWith(
        slug,
        {
          allow_tracing: undefined,
          connected_account_id: 'test-connected-account-id',
          custom_auth_params: {
            base_url: 'https://custom-api.example.com',
            parameters: [{ name: 'x-api-key', value: 'test-key', in: 'header' }],
            body: { extra: 'data' },
          },
          custom_connection_data: undefined,
          arguments: body.arguments,
          user_id: body.userId,
          version: 'latest',
          text: undefined,
        },
        undefined
      );
      expect(result).toEqual(toolMocks.toolExecuteResponse);
    });

    it('should pass version parameter from execute() to getRawComposioToolBySlug()', async () => {
      const slug = 'COMPOSIO_TOOL';
      const explicitVersion = '20250909_00';
      const body = {
        userId: 'test-user',
        version: explicitVersion,
        arguments: { title: 'Test Issue' },
      };

      const { getRawComposioToolBySlugSpy } = await mockToolExecution(context.tools);

      await context.tools.execute(slug, body);

      // Verify getRawComposioToolBySlug was called with version
      expect(getRawComposioToolBySlugSpy).toHaveBeenCalledWith(
        slug,
        {
          version: explicitVersion,
        },
        undefined
      );

      // Verify the API execute call received the version
      expect(mockClient.tools.execute).toHaveBeenCalledWith(
        slug,
        expect.objectContaining({
          version: explicitVersion,
        }),
        undefined
      );
    });

    it('should pass version: latest from execute() to getRawComposioToolBySlug()', async () => {
      const slug = 'COMPOSIO_TOOL';
      const body = {
        userId: 'test-user',
        version: 'latest' as const,
        dangerouslySkipVersionCheck: true,
        arguments: { title: 'Test Issue' },
      };

      const { getRawComposioToolBySlugSpy } = await mockToolExecution(context.tools);

      await context.tools.execute(slug, body);

      // Verify getRawComposioToolBySlug was called with version: 'latest'
      expect(getRawComposioToolBySlugSpy).toHaveBeenCalledWith(
        slug,
        {
          version: 'latest',
        },
        undefined
      );
    });

    it('should not pass version to getRawComposioToolBySlug() when not provided in execute()', async () => {
      const slug = 'COMPOSIO_TOOL';
      const body = {
        userId: 'test-user',
        arguments: { title: 'Test Issue' },
        dangerouslySkipVersionCheck: true,
      };

      const { getRawComposioToolBySlugSpy } = await mockToolExecution(context.tools);

      await context.tools.execute(slug, body);

      // Verify getRawComposioToolBySlug was called without version (should fallback to SDK config)
      expect(getRawComposioToolBySlugSpy).toHaveBeenCalledWith(
        slug,
        {
          version: undefined,
        },
        undefined
      );
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

      expect(mockClient.tools.proxy).toHaveBeenCalledWith(
        {
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
        },
        undefined
      );

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

      expect(mockClient.tools.proxy).toHaveBeenCalledWith(
        {
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
        },
        undefined
      );

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

      expect(mockClient.tools.proxy).toHaveBeenCalledWith(
        {
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
        },
        undefined
      );

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

      expect(mockClient.tools.proxy).toHaveBeenCalledWith(
        {
          endpoint: '/api/no-params',
          method: 'PUT',
          body: { update: 'data' },
          connected_account_id: 'test-account-id',
          parameters: [],
        },
        undefined
      );

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

      expect(mockClient.tools.proxy).toHaveBeenCalledWith(
        {
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
        },
        undefined
      );

      expect(result).toEqual(expectedProxyResponse);
    });

    it('should throw validation error for invalid parameters', async () => {
      const invalidProxyParams = {
        endpoint: '/api/test',
        method: 'INVALID_METHOD' as unknown,
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

  describe('Tool Router Execution', () => {
    const sessionId = 'test-session-123';

    describe('executeSessionTool', () => {
      it('should execute a tool via tool router session', async () => {
        const toolSlug = 'COMPOSIO_TOOL';
        const body = {
          sessionId,
          arguments: { query: 'test' },
        };

        mockClient.toolRouter.session.execute.mockResolvedValueOnce({
          data: { results: true },
          error: null,
          log_id: '123',
        });

        const result = await context.tools.executeSessionTool(toolSlug, body);

        expect(mockClient.toolRouter.session.execute).toHaveBeenCalledWith(
          sessionId,
          {
            tool_slug: toolSlug,
            arguments: body.arguments,
            enable_auto_workbench_offload: true,
          },
          undefined
        );
        expect(result).toEqual({
          data: { results: true },
          error: null,
          successful: true,
          logId: '123',
        });
      });

      it('should pass inline custom tools to tool router session execute', async () => {
        const toolSlug = 'COMPOSIO_TOOL';
        const body = {
          sessionId,
          arguments: { query: 'test' },
        };

        mockClient.toolRouter.session.execute.mockResolvedValueOnce({
          data: { results: true },
          error: null,
          log_id: '123',
        });

        await context.tools.executeSessionTool(toolSlug, body, undefined, undefined, {
          experimental: {
            custom_tools: [
              {
                slug: 'GREP',
                name: 'Grep',
                description: 'Search local text',
                input_schema: { type: 'object', properties: {} },
              },
            ],
          },
        });

        expect(mockClient.toolRouter.session.execute).toHaveBeenCalledWith(
          sessionId,
          {
            tool_slug: toolSlug,
            arguments: body.arguments,
            enable_auto_workbench_offload: true,
            experimental: {
              custom_tools: [expect.objectContaining({ slug: 'GREP' })],
            },
          },
          undefined
        );
      });

      it('should throw validation error for invalid parameters', async () => {
        const invalidBody = {
          // missing sessionId
          arguments: { query: 'test' },
        } as unknown;

        await expect(
          context.tools.executeSessionTool('COMPOSIO_TOOL', invalidBody)
        ).rejects.toThrow('Invalid tool execute session parameters');
      });

      it('should throw error if tool is not found', async () => {
        const apiError = new Error('Tool not found');
        mockClient.toolRouter.session.execute.mockRejectedValueOnce(apiError);

        await expect(
          context.tools.executeSessionTool('NONEXISTENT_TOOL', {
            sessionId,
            arguments: { query: 'test' },
          })
        ).rejects.toThrow('Tool not found');
      });

      it('should apply beforeExecute modifier', async () => {
        const toolSlug = 'COMPOSIO_TOOL';
        const body = {
          sessionId,
          arguments: { query: 'original' },
        };

        const toolWithToolkit = {
          ...toolMocks.transformedTool,
          toolkit: { slug: 'test-toolkit', name: 'Test Toolkit' },
        };

        mockClient.toolRouter.session.execute.mockResolvedValueOnce({
          data: { results: true },
          error: null,
          log_id: '123',
        });

        const beforeExecute = vi.fn().mockImplementation(({ params }) => ({
          ...params,
          query: 'modified',
        }));

        await context.tools.executeSessionTool(
          toolSlug,
          body,
          { beforeExecute },
          toolWithToolkit as unknown as Tool
        );

        expect(beforeExecute).toHaveBeenCalledWith({
          toolSlug,
          toolkitSlug: 'test-toolkit',
          sessionId,
          params: { query: 'original' },
        });

        expect(mockClient.toolRouter.session.execute).toHaveBeenCalledWith(
          sessionId,
          {
            tool_slug: toolSlug,
            arguments: { query: 'modified' },
            enable_auto_workbench_offload: true,
          },
          undefined
        );
      });

      it('should apply afterExecute modifier', async () => {
        const toolSlug = 'COMPOSIO_TOOL';
        const body = {
          sessionId,
          arguments: { query: 'test' },
        };

        const toolWithToolkit = {
          ...toolMocks.transformedTool,
          toolkit: { slug: 'test-toolkit', name: 'Test Toolkit' },
        };

        mockClient.toolRouter.session.execute.mockResolvedValueOnce({
          data: { results: true },
          error: null,
          log_id: '123',
        });

        const afterExecute = vi.fn().mockImplementation(({ result }) => ({
          ...result,
          data: { results: 'modified result' },
        }));

        const result = await context.tools.executeSessionTool(
          toolSlug,
          body,
          { afterExecute },
          toolWithToolkit as unknown as Tool
        );

        expect(afterExecute).toHaveBeenCalledWith({
          toolSlug,
          toolkitSlug: 'test-toolkit',
          sessionId,
          result: {
            data: { results: true },
            error: null,
            successful: true,
            logId: '123',
          },
        });

        expect(result.data).toEqual({ results: 'modified result' });
      });

      it('should handle error responses from tool router', async () => {
        const toolSlug = 'COMPOSIO_TOOL';
        const body = {
          sessionId,
          arguments: { query: 'test' },
        };

        mockClient.toolRouter.session.execute.mockResolvedValueOnce({
          data: null,
          error: 'Something went wrong',
          log_id: '456',
        });

        const result = await context.tools.executeSessionTool(toolSlug, body);

        expect(result).toEqual({
          data: null,
          error: 'Something went wrong',
          successful: false,
          logId: '456',
        });
      });

      it('should handle tool without toolkit gracefully', async () => {
        const toolSlug = 'TOOL_WITHOUT_TOOLKIT';
        const body = {
          sessionId,
          arguments: { query: 'test' },
        };

        const toolWithoutToolkit = {
          ...toolMocks.transformedTool,
          toolkit: undefined,
        };

        mockClient.toolRouter.session.execute.mockResolvedValueOnce({
          data: { results: true },
          error: null,
          log_id: '123',
        });

        const beforeExecute = vi.fn().mockImplementation(({ params }) => params);
        const afterExecute = vi.fn().mockImplementation(({ result }) => result);

        await context.tools.executeSessionTool(
          toolSlug,
          body,
          { beforeExecute, afterExecute },
          toolWithoutToolkit as unknown as Tool
        );

        expect(beforeExecute).toHaveBeenCalledWith({
          toolSlug,
          toolkitSlug: 'composio',
          sessionId,
          params: { query: 'test' },
        });
        expect(afterExecute).toHaveBeenCalledWith({
          toolSlug,
          toolkitSlug: 'composio',
          sessionId,
          result: {
            data: { results: true },
            error: null,
            successful: true,
            logId: '123',
          },
        });
      });
    });

    describe('wrapToolsForToolRouter', () => {
      it('should wrap tools with tool router execute function', async () => {
        const tools = [toolMocks.transformedTool as unknown as Tool];

        context.mockProvider.wrapTools.mockReturnValueOnce('wrapped-tools');

        const result = context.tools.wrapToolsForToolRouter(sessionId, tools);

        expect(context.mockProvider.wrapTools).toHaveBeenCalledWith(tools, expect.any(Function));
        expect(result).toBe('wrapped-tools');
      });

      it('should create execute function that calls executeSessionTool', async () => {
        const tools = [toolMocks.transformedTool as unknown as Tool];

        let capturedExecuteFn: (
          toolSlug: string,
          input: Record<string, unknown>
        ) => Promise<unknown>;

        context.mockProvider.wrapTools.mockImplementation((tools, executeFn) => {
          capturedExecuteFn = executeFn;
          return 'wrapped-tools';
        });

        context.tools.wrapToolsForToolRouter(sessionId, tools);

        mockClient.toolRouter.session.execute.mockResolvedValueOnce({
          data: { results: true },
          error: null,
          log_id: '123',
        });

        // Call the captured execute function
        const result = await capturedExecuteFn!('COMPOSIO_TOOL', { query: 'test' });

        expect(mockClient.toolRouter.session.execute).toHaveBeenCalledWith(
          sessionId,
          {
            tool_slug: 'COMPOSIO_TOOL',
            arguments: { query: 'test' },
            enable_auto_workbench_offload: true,
          },
          undefined
        );
        expect(result).toEqual({
          data: { results: true },
          error: null,
          successful: true,
          logId: '123',
        });
      });

      it('should pass modifiers to the execute function', async () => {
        const tools = [toolMocks.transformedTool as unknown as Tool];
        const modifiers = {
          beforeExecute: vi.fn().mockImplementation(({ params }) => ({
            ...params,
            modified: true,
          })),
        };

        let capturedExecuteFn: (
          toolSlug: string,
          input: Record<string, unknown>
        ) => Promise<unknown>;

        context.mockProvider.wrapTools.mockImplementation((tools, executeFn) => {
          capturedExecuteFn = executeFn;
          return 'wrapped-tools';
        });

        context.tools.wrapToolsForToolRouter(sessionId, tools, modifiers);

        mockClient.toolRouter.session.execute.mockResolvedValueOnce({
          data: { results: true },
          error: null,
          log_id: '123',
        });

        // Call the captured execute function
        await capturedExecuteFn!('COMPOSIO_TOOL', { query: 'test' });

        expect(modifiers.beforeExecute).toHaveBeenCalled();
        expect(mockClient.toolRouter.session.execute).toHaveBeenCalledWith(
          sessionId,
          {
            tool_slug: 'COMPOSIO_TOOL',
            arguments: { query: 'test', modified: true },
            enable_auto_workbench_offload: true,
          },
          undefined
        );
      });

      it('should handle multiple tools', async () => {
        const tools = [
          toolMocks.transformedTool as unknown as Tool,
          { ...toolMocks.transformedTool, slug: 'ANOTHER_TOOL' } as unknown as Tool,
        ];

        context.mockProvider.wrapTools.mockReturnValueOnce('wrapped-tools');

        const result = context.tools.wrapToolsForToolRouter(sessionId, tools);

        expect(context.mockProvider.wrapTools).toHaveBeenCalledWith(tools, expect.any(Function));
        expect(result).toBe('wrapped-tools');
      });

      it('should handle empty tools array', async () => {
        const tools: Tool[] = [];

        context.mockProvider.wrapTools.mockReturnValueOnce([]);

        const result = context.tools.wrapToolsForToolRouter(sessionId, tools);

        expect(context.mockProvider.wrapTools).toHaveBeenCalledWith([], expect.any(Function));
        expect(result).toEqual([]);
      });
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

        expect(mockClient.tools.list).toHaveBeenCalledWith(
          {
            tool_slugs: 'TEST_TOOL',
            limit: 9999,
            toolkit_versions: 'latest',
          },
          undefined
        );
      });

      it('should pass global version string when configured', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient, {
          provider: mockProvider,
          toolkitVersions: '20251201_03' as unknown,
        });

        mockClient.tools.list.mockResolvedValueOnce({
          items: [toolMocks.rawTool],
          totalPages: 1,
        });

        await tools.getRawComposioTools({ toolkits: ['github'] });

        expect(mockClient.tools.list).toHaveBeenCalledWith(
          {
            toolkit_slug: 'github',
            important: 'true',
            toolkit_versions: '20251201_03',
          },
          undefined
        );
      });

      it('should pass toolkit-specific versions when configured as object', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient, {
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

        expect(mockClient.tools.list).toHaveBeenCalledWith(
          {
            toolkit_slug: 'github',
            important: 'true',
            toolkit_versions: {
              github: '20251201_01',
              slack: 'latest',
              gmail: '20251201_05',
            },
          },
          undefined
        );
      });

      it('should pass versions when fetching tools by tool slugs', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient, {
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

        expect(mockClient.tools.list).toHaveBeenCalledWith(
          {
            tool_slugs: 'GITHUB_CREATE_ISSUE,SLACK_SEND_MESSAGE',
            limit: 9999,
            toolkit_versions: {
              github: '20251201_01',
              slack: 'latest',
            },
          },
          undefined
        );
      });

      it('should pass versions when searching tools', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient, {
          provider: mockProvider,
          toolkitVersions: 'latest',
        });

        mockClient.tools.list.mockResolvedValueOnce({
          items: [toolMocks.rawTool],
          totalPages: 1,
        });

        await tools.getRawComposioTools({ search: 'create issue' });

        expect(mockClient.tools.list).toHaveBeenCalledWith(
          {
            search: 'create issue',
            toolkit_versions: 'latest',
          },
          undefined
        );
      });
    });

    describe('toolkit versions in individual tool retrieval', () => {
      it('should pass default "latest" version when retrieving single tool', async () => {
        const context = createTestContext();

        mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

        await context.tools.getRawComposioToolBySlug('GITHUB_CREATE_ISSUE');

        expect(mockClient.tools.retrieve).toHaveBeenCalledWith(
          'GITHUB_CREATE_ISSUE',
          {
            toolkit_versions: 'latest',
          },
          undefined
        );
      });

      it('should pass global version when retrieving single tool', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient, {
          provider: mockProvider,
          toolkitVersions: '20251201_03' as unknown,
        });

        mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

        await tools.getRawComposioToolBySlug('GITHUB_CREATE_ISSUE');

        expect(mockClient.tools.retrieve).toHaveBeenCalledWith(
          'GITHUB_CREATE_ISSUE',
          {
            toolkit_versions: '20251201_03',
          },
          undefined
        );
      });

      it('should pass toolkit-specific versions when retrieving single tool', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient, {
          provider: mockProvider,
          toolkitVersions: {
            github: '20251201_01',
            slack: 'latest',
            gmail: '20251201_05',
          },
        });

        mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);

        await tools.getRawComposioToolBySlug('SLACK_SEND_MESSAGE');

        expect(mockClient.tools.retrieve).toHaveBeenCalledWith(
          'SLACK_SEND_MESSAGE',
          {
            toolkit_versions: {
              github: '20251201_01',
              slack: 'latest',
              gmail: '20251201_05',
            },
          },
          undefined
        );
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

        expect(mockClient.tools.execute).toHaveBeenCalledWith(
          'COMPOSIO_TOOL',
          {
            allow_tracing: undefined,
            connected_account_id: 'test-account',
            custom_auth_params: undefined,
            custom_connection_data: undefined,
            arguments: { title: 'Test Issue' },
            user_id: undefined,
            version: 'latest', // should use latest as default
            text: undefined,
          },
          undefined
        );
      });

      it('should use global version when configured', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient, {
          provider: mockProvider,
          toolkitVersions: '20251201_03' as unknown,
        });
        const spies = await mockToolExecution(tools);

        const executeParams: ToolExecuteParams = {
          arguments: { title: 'Test Issue' },
          connectedAccountId: 'test-account',
        };

        await tools.execute('GITHUB_CREATE_ISSUE', executeParams);

        expect(mockClient.tools.execute).toHaveBeenCalledWith(
          'COMPOSIO_TOOL',
          {
            allow_tracing: undefined,
            connected_account_id: 'test-account',
            custom_auth_params: undefined,
            custom_connection_data: undefined,
            arguments: { title: 'Test Issue' },
            user_id: undefined,
            version: '20251201_03', // should use global version
            text: undefined,
          },
          undefined
        );
      });

      it('should use toolkit-specific version when configured as object', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient, {
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

        expect(mockClient.tools.execute).toHaveBeenCalledWith(
          'COMPOSIO_TOOL',
          {
            allow_tracing: undefined,
            connected_account_id: 'test-account',
            custom_auth_params: undefined,
            custom_connection_data: undefined,
            arguments: { title: 'Test Issue' },
            user_id: undefined,
            version: '20251201_01', // should use test-toolkit-specific version
            text: undefined,
          },
          undefined
        );
      });

      it('should use fallback to "latest" when toolkit not in version mapping', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient, {
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

        expect(mockClient.tools.execute).toHaveBeenCalledWith(
          'COMPOSIO_TOOL',
          {
            allow_tracing: undefined,
            connected_account_id: 'test-account',
            custom_auth_params: undefined,
            custom_connection_data: undefined,
            arguments: { title: 'Test Page' },
            user_id: undefined,
            version: 'latest', // should fallback to latest for unknown toolkit
            text: undefined,
          },
          undefined
        );
      });

      it('should prioritize explicit version parameter over configured versions', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient, {
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

        expect(mockClient.tools.execute).toHaveBeenCalledWith(
          'COMPOSIO_TOOL',
          {
            allow_tracing: undefined,
            connected_account_id: 'test-account',
            custom_auth_params: undefined,
            custom_connection_data: undefined,
            arguments: { title: 'Test Issue' },
            user_id: undefined,
            version: '20251201_03', // explicit version takes precedence
            text: undefined,
          },
          undefined
        );
      });

      it('should handle tool without toolkit gracefully', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient, {
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

        const beforeExecute = vi.fn().mockImplementation(({ params }) => params);
        const afterExecute = vi.fn().mockImplementation(({ result }) => result);

        await tools.execute('SOME_CUSTOM_TOOL', executeParams, {
          beforeExecute,
          afterExecute,
        });

        expect(beforeExecute).toHaveBeenCalledWith({
          toolSlug: 'SOME_CUSTOM_TOOL',
          toolkitSlug: 'unknown',
          params: executeParams,
        });
        expect(afterExecute).toHaveBeenCalledWith(
          expect.objectContaining({
            toolSlug: 'SOME_CUSTOM_TOOL',
            toolkitSlug: 'unknown',
          })
        );

        expect(mockClient.tools.execute).toHaveBeenCalledWith(
          'COMPOSIO_TOOL',
          {
            allow_tracing: undefined,
            connected_account_id: 'test-account',
            custom_auth_params: undefined,
            custom_connection_data: undefined,
            arguments: { query: 'test' },
            user_id: undefined,
            version: 'latest', // should fallback to latest for unknown toolkit
            text: undefined,
          },
          undefined
        );
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
        const tools = new Tools(mockClient, {
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

        expect(mockClient.tools.list).toHaveBeenCalledWith(
          {
            toolkit_slug: 'github',
            important: 'true',
            toolkit_versions: {
              github: '20251201_08',
              slack: 'latest',
            },
          },
          undefined
        );
      });

      it('should prioritize user config over environment variables', async () => {
        // Set environment variables
        process.env.COMPOSIO_TOOLKIT_VERSION_GITHUB = '20251201_08';
        process.env.COMPOSIO_TOOLKIT_VERSION_SLACK = 'latest';

        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient, {
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

        expect(mockClient.tools.list).toHaveBeenCalledWith(
          {
            toolkit_slug: 'github',
            important: 'true',
            toolkit_versions: {
              github: '20251201_04', // user config wins
              gmail: '20251201_05', // from user config
            },
          },
          undefined
        );
      });

      it('should use global version string to override everything', async () => {
        // Set environment variables
        process.env.COMPOSIO_TOOLKIT_VERSION_GITHUB = '20251201_08';
        process.env.COMPOSIO_TOOLKIT_VERSION_SLACK = 'latest';

        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient, {
          provider: mockProvider,
          toolkitVersions: '20251201_09' as unknown, // global version overrides everything
        });

        mockClient.tools.list.mockResolvedValueOnce({
          items: [toolMocks.rawTool],
          totalPages: 1,
        });

        await tools.getRawComposioTools({ toolkits: ['github'] });

        expect(mockClient.tools.list).toHaveBeenCalledWith(
          {
            toolkit_slug: 'github',
            important: 'true',
            toolkit_versions: '20251201_09', // global version ignores env vars
          },
          undefined
        );
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
        expect(mockClient.tools.execute).toHaveBeenCalledWith(
          'COMPOSIO_TOOL',
          {
            allow_tracing: undefined,
            connected_account_id: 'test-account',
            custom_auth_params: undefined,
            custom_connection_data: undefined,
            arguments: { title: 'Test Issue' },
            user_id: undefined,
            version: 'latest',
            text: undefined,
          },
          undefined
        );
      });

      it('should succeed when executing with a specific version (not "latest") without dangerouslySkipVersionCheck', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient, {
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
        expect(mockClient.tools.execute).toHaveBeenCalledWith(
          'COMPOSIO_TOOL',
          {
            allow_tracing: undefined,
            connected_account_id: 'test-account',
            custom_auth_params: undefined,
            custom_connection_data: undefined,
            arguments: { title: 'Test Issue' },
            user_id: undefined,
            version: '20251201_01', // specific version should work without skip flag
            text: undefined,
          },
          undefined
        );
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
        expect(mockClient.tools.execute).toHaveBeenCalledWith(
          'COMPOSIO_TOOL',
          {
            allow_tracing: undefined,
            connected_account_id: 'test-account',
            custom_auth_params: undefined,
            custom_connection_data: undefined,
            arguments: { title: 'Test Issue' },
            user_id: undefined,
            version: '20251201_03',
            text: undefined,
          },
          undefined
        );
      });

      it('should throw error when explicit version parameter is "latest" without dangerouslySkipVersionCheck', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient, {
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
        } catch (rawError: unknown) {
          const error = rawError as unknown as ErrorWithPossibleFixes;
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

      it('should reuse the fetched schema during agentic provider execution', async () => {
        const context = createTestContext();
        const userId = 'test-user';
        const toolSlug = 'GITHUB_CREATE_ISSUE';
        const fetchedTool = {
          ...toolMocks.transformedTool,
          slug: toolSlug,
          toolkit: { slug: 'github', name: 'GitHub' },
        } as unknown as Tool;
        const getRawComposioToolBySlugSpy = vi.spyOn(context.tools, 'getRawComposioToolBySlug');
        getRawComposioToolBySlugSpy.mockResolvedValue(fetchedTool);

        let storedExecuteToolFn: ExecuteToolFn | undefined;
        context.mockProvider.wrapTools.mockImplementation((_tools, executeToolFn) => {
          storedExecuteToolFn = executeToolFn;
          return 'wrapped-tools-collection';
        });

        await context.tools.get(userId, toolSlug);
        mockClient.tools.execute.mockResolvedValueOnce(toolMocks.rawToolExecuteResponse);
        const result = await storedExecuteToolFn!(toolSlug, { title: 'Test Issue' });

        expect(result).toEqual(toolMocks.toolExecuteResponse);
        expect(getRawComposioToolBySlugSpy).toHaveBeenCalledTimes(1);
        expect(mockClient.tools.retrieve).not.toHaveBeenCalled();
        expect(mockClient.tools.execute).toHaveBeenCalledWith(
          toolSlug,
          {
            allow_tracing: undefined,
            connected_account_id: undefined,
            custom_auth_params: undefined,
            custom_connection_data: undefined,
            arguments: { title: 'Test Issue' },
            user_id: userId,
            version: 'latest',
            text: undefined,
          },
          undefined
        );
      });

      it('should reject invalid agentic provider input before execution', async () => {
        const context = createTestContext();
        const toolSlug = 'GITHUB_CREATE_ISSUE';
        const fetchedTool = {
          ...toolMocks.transformedTool,
          slug: toolSlug,
          toolkit: { slug: 'github', name: 'GitHub' },
        } as unknown as Tool;
        const getRawComposioToolBySlugSpy = vi.spyOn(context.tools, 'getRawComposioToolBySlug');
        getRawComposioToolBySlugSpy.mockResolvedValue(fetchedTool);
        let storedExecuteToolFn: ExecuteToolFn | undefined;

        context.mockProvider.wrapTools.mockImplementation((_tools, executeToolFn) => {
          storedExecuteToolFn = executeToolFn;
          return 'wrapped-tools-collection';
        });

        await context.tools.get('test-user', toolSlug);

        await expect(
          storedExecuteToolFn!(toolSlug, 42 as unknown as Record<string, unknown>)
        ).rejects.toThrow(ValidationError);
        expect(getRawComposioToolBySlugSpy).toHaveBeenCalledTimes(1);
        expect(mockClient.tools.execute).not.toHaveBeenCalled();
      });

      it('should retrieve an unknown provider tool before execution', async () => {
        const context = createTestContext();
        const userId = 'test-user';
        const fetchedToolSlug = 'GITHUB_CREATE_ISSUE';
        const unknownToolSlug = 'GITHUB_GET_ISSUE';
        const fetchedTool = {
          ...toolMocks.transformedTool,
          slug: fetchedToolSlug,
          toolkit: { slug: 'github', name: 'GitHub' },
        } as unknown as Tool;
        const unknownTool = { ...fetchedTool, slug: unknownToolSlug };
        const getRawComposioToolBySlugSpy = vi.spyOn(context.tools, 'getRawComposioToolBySlug');
        getRawComposioToolBySlugSpy
          .mockResolvedValueOnce(fetchedTool)
          .mockResolvedValueOnce(unknownTool);
        let storedExecuteToolFn: ExecuteToolFn | undefined;

        context.mockProvider.wrapTools.mockImplementation((_tools, executeToolFn) => {
          storedExecuteToolFn = executeToolFn;
          return 'wrapped-tools-collection';
        });

        await context.tools.get(userId, fetchedToolSlug);
        mockClient.tools.execute.mockResolvedValueOnce(toolMocks.rawToolExecuteResponse);
        await storedExecuteToolFn!(unknownToolSlug, {});

        expect(getRawComposioToolBySlugSpy).toHaveBeenCalledTimes(2);
        expect(getRawComposioToolBySlugSpy).toHaveBeenNthCalledWith(
          2,
          unknownToolSlug,
          { version: undefined },
          undefined
        );
        expect(mockClient.tools.execute).toHaveBeenCalledWith(
          unknownToolSlug,
          expect.objectContaining({ user_id: userId, version: 'latest' }),
          undefined
        );
      });

      it('should preserve execution metadata when modifySchema mutates the fetched tool', async () => {
        const mockProvider = new MockProvider();
        const tools = new Tools(mockClient, {
          provider: mockProvider,
          toolkitVersions: { 'test-toolkit': '20250101_00' },
        });
        const userId = 'test-user';
        const toolSlug = 'GITHUB_CREATE_ISSUE';
        const rawTool = {
          ...toolMocks.rawTool,
          slug: toolSlug,
          toolkit: { slug: 'test-toolkit', name: 'Test Toolkit' },
        };
        let wrappedTools: Tool[] | undefined;
        let storedExecuteToolFn: ExecuteToolFn | undefined;

        mockClient.tools.retrieve.mockReset().mockResolvedValueOnce(rawTool);
        mockProvider.wrapTools.mockImplementation((toolsToWrap, executeToolFn) => {
          wrappedTools = toolsToWrap;
          storedExecuteToolFn = executeToolFn;
          return 'wrapped-tools';
        });

        await tools.get(userId, toolSlug, {
          modifySchema: ({ schema }) => {
            schema.toolkit = { slug: 'renamed-toolkit', name: 'Renamed Toolkit' };
            return schema;
          },
        });
        mockClient.tools.execute.mockResolvedValueOnce(toolMocks.rawToolExecuteResponse);
        await storedExecuteToolFn!(toolSlug, {});

        expect(wrappedTools?.[0].toolkit?.slug).toBe('renamed-toolkit');
        expect(mockClient.tools.retrieve).toHaveBeenCalledTimes(1);
        expect(mockClient.tools.execute).toHaveBeenCalledWith(
          toolSlug,
          expect.objectContaining({ version: '20250101_00' }),
          undefined
        );
      });
    });
  });
});

describe('retries disabled on non-idempotent writes', () => {
  // Regression: a timed-out, non-idempotent tools.execute / tools.proxy must not
  // be silently retried — a retry after a server-side success duplicates the side
  // effect (e.g. sends the same email up to 3 times). Both route through a sibling
  // client built with maxRetries: 0; reads keep the client's default retries.
  // See https://github.com/ComposioHQ/composio/issues/3586 (TS parity with Python).
  const context = createTestContext();
  setupTest(context);

  it('routes tools.execute through a client with maxRetries: 0', async () => {
    await mockToolExecution(context.tools);

    await context.tools.execute('COMPOSIO_TOOL', {
      userId: 'test-user',
      arguments: { query: 'test' },
      dangerouslySkipVersionCheck: true,
    });

    expect(mockClient.withOptions).toHaveBeenCalledWith({ maxRetries: 0 });
    expect(mockClient.tools.execute).toHaveBeenCalledTimes(1);
  });

  it('routes tools.proxyExecute through a client with maxRetries: 0', async () => {
    mockClient.tools.proxy.mockResolvedValueOnce({ data: {}, successful: true });

    await context.tools.proxyExecute({
      endpoint: '/api/test',
      method: 'POST' as const,
      body: { data: 'test' },
      connectedAccountId: 'test-account-id',
    });

    expect(mockClient.withOptions).toHaveBeenCalledWith({ maxRetries: 0 });
    expect(mockClient.tools.proxy).toHaveBeenCalledTimes(1);
  });

  it('reuses one no-retries sibling client across executes (cached per instance)', async () => {
    const { getRawComposioToolBySlugSpy } = await mockToolExecution(context.tools);

    await context.tools.execute('COMPOSIO_TOOL', {
      userId: 'test-user',
      arguments: { query: 'test' },
      dangerouslySkipVersionCheck: true,
    });

    // Queue a second execute; mockToolExecution only primed one response.
    getRawComposioToolBySlugSpy.mockResolvedValueOnce(toolMocks.transformedTool as unknown as Tool);
    mockClient.tools.execute.mockResolvedValueOnce(toolMocks.rawToolExecuteResponse);
    await context.tools.execute('COMPOSIO_TOOL', {
      userId: 'test-user',
      arguments: { query: 'test again' },
      dangerouslySkipVersionCheck: true,
    });

    expect(mockClient.tools.execute).toHaveBeenCalledTimes(2);
    expect(mockClient.withOptions).toHaveBeenCalledTimes(1);
  });
});
