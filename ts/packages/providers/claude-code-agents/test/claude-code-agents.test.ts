import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeCodeAgentsProvider } from '../src';
import { Tool } from '@composio/core';

// Mock the claude-agent-sdk module
vi.mock('@anthropic-ai/claude-agent-sdk', () => {
  return {
    tool: vi.fn().mockImplementation((name, description, schema, handler) => {
      return {
        name,
        description,
        schema,
        handler,
        _isMockedClaudeAgentTool: true,
      };
    }),
    createSdkMcpServer: vi.fn().mockImplementation(options => {
      return {
        type: 'sdk',
        name: options.name,
        version: options.version,
        tools: options.tools,
        _isMockedMcpServer: true,
      };
    }),
  };
});

// Import mocked functions for assertions
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';

// Define interface for mocked tool
interface MockedClaudeAgentTool {
  name: string;
  description: string;
  schema: any;
  handler: Function;
  _isMockedClaudeAgentTool: boolean;
}

// Define interface for mocked MCP server
interface MockedMcpServer {
  type: string;
  name: string;
  version: string;
  tools: MockedClaudeAgentTool[];
  _isMockedMcpServer: boolean;
}

describe('ClaudeCodeAgentsProvider', () => {
  let provider: ClaudeCodeAgentsProvider;
  let mockTool: Tool;
  let mockExecuteToolFn: any;

  beforeEach(() => {
    provider = new ClaudeCodeAgentsProvider();

    // Mock the global execute tool function
    mockExecuteToolFn = vi.fn().mockResolvedValue({
      data: { result: 'success' },
      error: null,
      successful: true,
    });
    provider._setExecuteToolFn(mockExecuteToolFn);

    // Create a mock Composio tool
    mockTool = {
      slug: 'GMAIL_SEND_EMAIL',
      name: 'Gmail Send Email',
      description: 'Send an email via Gmail',
      version: '20250909_00',
      availableVersions: ['20250909_00'],
      inputParameters: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Recipient email address',
          },
          subject: {
            type: 'string',
            description: 'Email subject',
          },
          body: {
            type: 'string',
            description: 'Email body content',
          },
        },
        required: ['to', 'subject', 'body'],
      },
      tags: ['email', 'gmail'],
    };

    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('name property', () => {
    it('should have the correct name', () => {
      expect(provider.name).toBe('claude-code-agents');
    });
  });

  describe('_isAgentic property', () => {
    it('should be agentic', () => {
      expect(provider._isAgentic).toBe(true);
    });
  });

  describe('constructor options', () => {
    it('should use default server name and version', () => {
      const defaultProvider = new ClaudeCodeAgentsProvider();
      // First wrap the tools, then create MCP server with wrapped tools
      const wrappedTools = defaultProvider.wrapTools([mockTool], mockExecuteToolFn);
      defaultProvider.createMcpServer(wrappedTools);

      expect(createSdkMcpServer).toHaveBeenCalledWith({
        name: 'composio',
        version: '1.0.0',
        tools: expect.any(Array),
      });
    });

    it('should use custom server name and version', () => {
      const customProvider = new ClaudeCodeAgentsProvider({
        serverName: 'my-custom-server',
        serverVersion: '2.0.0',
      });
      // First wrap the tools, then create MCP server with wrapped tools
      const wrappedTools = customProvider.wrapTools([mockTool], mockExecuteToolFn);
      customProvider.createMcpServer(wrappedTools);

      expect(createSdkMcpServer).toHaveBeenCalledWith({
        name: 'my-custom-server',
        version: '2.0.0',
        tools: expect.any(Array),
      });
    });
  });

  describe('wrapTool', () => {
    it('should wrap a tool in Claude Agent SDK MCP tool format', () => {
      const wrapped = provider.wrapTool(
        mockTool,
        mockExecuteToolFn
      ) as unknown as MockedClaudeAgentTool;

      expect(tool).toHaveBeenCalledWith(
        mockTool.slug,
        mockTool.description,
        expect.any(Object), // Zod schema
        expect.any(Function) // Handler
      );

      expect(wrapped._isMockedClaudeAgentTool).toBe(true);
      expect(wrapped.name).toBe(mockTool.slug);
      expect(wrapped.description).toBe(mockTool.description);
    });

    it('should handle tools without input parameters', () => {
      const toolWithoutParams: Tool = {
        ...mockTool,
        inputParameters: undefined,
      };

      const wrapped = provider.wrapTool(
        toolWithoutParams,
        mockExecuteToolFn
      ) as unknown as MockedClaudeAgentTool;

      expect(tool).toHaveBeenCalledWith(
        toolWithoutParams.slug,
        toolWithoutParams.description,
        expect.any(Object), // Empty Zod schema
        expect.any(Function)
      );
      expect(wrapped._isMockedClaudeAgentTool).toBe(true);
    });

    it('should handle tools without description', () => {
      const toolWithoutDescription: Tool = {
        ...mockTool,
        description: undefined,
      };

      const wrapped = provider.wrapTool(
        toolWithoutDescription,
        mockExecuteToolFn
      ) as unknown as MockedClaudeAgentTool;

      expect(tool).toHaveBeenCalledWith(
        toolWithoutDescription.slug,
        `Execute ${toolWithoutDescription.slug}`,
        expect.any(Object),
        expect.any(Function)
      );
      expect(wrapped._isMockedClaudeAgentTool).toBe(true);
    });

    it('should create a handler that executes the tool with correct parameters', async () => {
      provider.wrapTool(mockTool, mockExecuteToolFn);

      // Extract the handler function from the call to tool()
      const handler = (tool as any).mock.calls[0][3];

      // Test the handler
      const params = { to: 'test@example.com', subject: 'Test', body: 'Hello' };
      const result = await handler(params);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(mockTool.slug, params);
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              data: { result: 'success' },
              error: null,
              successful: true,
            }),
          },
        ],
      });
    });

    it('should handle string results from tool execution', async () => {
      mockExecuteToolFn.mockResolvedValueOnce('Simple string result');
      provider.wrapTool(mockTool, mockExecuteToolFn);

      const handler = (tool as any).mock.calls[0][3];
      const result = await handler({ to: 'test@example.com', subject: 'Test', body: 'Hello' });

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Simple string result',
          },
        ],
      });
    });
  });

  describe('wrapTools', () => {
    it('should wrap multiple tools', () => {
      const anotherTool: Tool = {
        ...mockTool,
        slug: 'SLACK_POST_MESSAGE',
        name: 'Slack Post Message',
        description: 'Post a message to Slack',
      };
      const tools = [mockTool, anotherTool];

      const wrapped = provider.wrapTools(tools, mockExecuteToolFn);

      expect(wrapped).toHaveLength(2);
      expect(tool).toHaveBeenCalledTimes(2);
    });

    it('should return an empty array for empty tools array', () => {
      const wrapped = provider.wrapTools([], mockExecuteToolFn);
      expect(wrapped).toEqual([]);
      expect(tool).not.toHaveBeenCalled();
    });
  });

  describe('createMcpServer', () => {
    it('should create an MCP server configuration from wrapped tools', () => {
      // First wrap the tools (simulating what composio.tools.get() does)
      const wrappedTools = provider.wrapTools([mockTool], mockExecuteToolFn);
      const mcpServer = provider.createMcpServer(wrappedTools) as unknown as MockedMcpServer;

      expect(createSdkMcpServer).toHaveBeenCalledWith({
        name: 'composio',
        version: '1.0.0',
        tools: expect.any(Array),
      });
      expect(mcpServer._isMockedMcpServer).toBe(true);
      expect(mcpServer.name).toBe('composio');
    });

    it('should include all wrapped tools in the MCP server', () => {
      const anotherTool: Tool = {
        ...mockTool,
        slug: 'SLACK_POST_MESSAGE',
        name: 'Slack Post Message',
      };
      // First wrap the tools
      const wrappedTools = provider.wrapTools([mockTool, anotherTool], mockExecuteToolFn);
      provider.createMcpServer(wrappedTools);

      const callArgs = (createSdkMcpServer as any).mock.calls[0][0];
      expect(callArgs.tools).toHaveLength(2);
    });
  });

  describe('wrapMcpServerResponse', () => {
    it('should transform MCP URL response to standard format', () => {
      const mcpUrlResponse = [
        { url: 'https://example.com/mcp1', name: 'Server 1' },
        { url: 'https://example.com/mcp2', name: 'Server 2' },
      ];

      const result = provider.wrapMcpServerResponse(mcpUrlResponse) as Array<{
        url: URL;
        name: string;
      }>;

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        url: new URL('https://example.com/mcp1'),
        name: 'Server 1',
      });
      expect(result[1]).toEqual({
        url: new URL('https://example.com/mcp2'),
        name: 'Server 2',
      });
    });
  });

  describe('executeTool', () => {
    it('should execute a tool using the global execute function', async () => {
      const toolSlug = 'GMAIL_SEND_EMAIL';
      const toolParams = {
        userId: 'test-user',
        arguments: { to: 'test@example.com', subject: 'Test', body: 'Hello' },
      };

      const result = await provider.executeTool(toolSlug, toolParams);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(toolSlug, toolParams, undefined);
      expect(result).toEqual({
        data: { result: 'success' },
        error: null,
        successful: true,
      });
    });

    it('should pass modifiers to the global execute function', async () => {
      const toolSlug = 'GMAIL_SEND_EMAIL';
      const toolParams = {
        userId: 'test-user',
        arguments: { to: 'test@example.com', subject: 'Test', body: 'Hello' },
      };

      const modifiers = {
        beforeExecute: vi.fn(({ params }) => params),
        afterExecute: vi.fn(({ result }) => result),
      };

      await provider.executeTool(toolSlug, toolParams, modifiers);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(toolSlug, toolParams, modifiers);
    });
  });

  describe('JSON Schema to Zod conversion', () => {
    it('should handle various property types', () => {
      const toolWithVariousTypes: Tool = {
        ...mockTool,
        inputParameters: {
          type: 'object',
          properties: {
            stringProp: { type: 'string', description: 'A string' },
            numberProp: { type: 'number', description: 'A number' },
            integerProp: { type: 'integer', description: 'An integer' },
            booleanProp: { type: 'boolean', description: 'A boolean' },
            arrayProp: { type: 'array', description: 'An array' },
            objectProp: { type: 'object', description: 'An object' },
            unknownProp: { type: 'custom', description: 'Unknown type' },
          },
          required: ['stringProp'],
        },
      };

      const wrapped = provider.wrapTool(toolWithVariousTypes, mockExecuteToolFn);

      // Verify tool was called (schema conversion happened without error)
      expect(tool).toHaveBeenCalled();
      expect(wrapped).toBeDefined();
    });

    it('should handle optional properties', () => {
      const toolWithOptionalProps: Tool = {
        ...mockTool,
        inputParameters: {
          type: 'object',
          properties: {
            required: { type: 'string' },
            optional: { type: 'string' },
          },
          required: ['required'],
        },
      };

      const wrapped = provider.wrapTool(toolWithOptionalProps, mockExecuteToolFn);

      expect(tool).toHaveBeenCalled();
      expect(wrapped).toBeDefined();
    });
  });
});
