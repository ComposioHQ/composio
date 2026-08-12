import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Tool, GlobalExecuteToolFn } from '@composio/core';
import { ClaudeAgentSDKProvider } from '../src';

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
  };
});

// Import mocked functions for assertions
import { tool } from '@anthropic-ai/claude-agent-sdk';

// Define interface for mocked tool
interface MockedClaudeAgentTool {
  name: string;
  description: string;
  schema: unknown;
  handler: Function;
  _isMockedClaudeAgentTool: boolean;
}

// Minimal structural type for the complete Zod object schema the provider registers, matching
// only the member these tests dereference (`safeParse`).
type MinimalZodSchema = {
  safeParse: (value: unknown) => { success: boolean };
};

// The handler captured off the mocked `tool()` call. Some tests intentionally pass a raw
// (possibly malformed) JSON string instead of an object to exercise the stringified-input
// normalization path (issue #2406), so the parameter is typed `unknown` here rather than the
// stricter `Record<string, unknown>` used by the real `wrapTool` handler signature.
type MockedToolHandler = (
  args: unknown
) => Promise<{ content: Array<{ type: string; text: string }> }>;

type MockedToolFn = Mock<
  (
    name: string,
    description: string | undefined,
    schema: MinimalZodSchema,
    handler: MockedToolHandler
  ) => unknown
>;

// `mockExecuteToolFn` is declared against the real `GlobalExecuteToolFn` contract, which always
// resolves with a `ToolExecuteResponse`. A couple of tests deliberately stub it with a plain
// string / `undefined` to exercise the wrapTool handler's defensive "stringify anything" branch,
// so those specific stubbing calls need a widened, minimal view of just the method they use.
type MockResolvableWithAnyValue = {
  mockResolvedValueOnce: (value: unknown) => void;
};

describe('ClaudeAgentSDKProvider', () => {
  let provider: ClaudeAgentSDKProvider;
  let mockTool: Tool;
  let mockExecuteToolFn: Mock<GlobalExecuteToolFn>;

  beforeEach(() => {
    provider = new ClaudeAgentSDKProvider();

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
      expect(provider.name).toBe('claude-agent-sdk');
    });
  });

  describe('_isAgentic property', () => {
    it('should be agentic', () => {
      expect(provider._isAgentic).toBe(true);
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

    it('should pass a complete Zod object schema to the Claude Agent SDK', () => {
      // A raw property shape drops every root-level constraint, so the provider registers the
      // whole object schema instead. See claude-agent-sdk.registration.test.ts for what that
      // buys at the real SDK boundary.
      provider.wrapTool(mockTool, mockExecuteToolFn);

      const schema = (tool as unknown as MockedToolFn).mock.calls[0][2];
      expect(schema.safeParse({ to: 'test@example.com', subject: 's', body: 'b' }).success).toBe(
        true
      );
      expect(schema.safeParse({ to: 123, subject: 's', body: 'b' }).success).toBe(false);
      // The root is strict: `additionalProperties` is omitted on a named-properties schema.
      expect(
        schema.safeParse({ to: 'test@example.com', subject: 's', body: 'b', extra: 'x' }).success
      ).toBe(false);
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
      const handler = (tool as unknown as MockedToolFn).mock.calls[0][3];

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

    it('should normalize a stringified-JSON input to an object before executing (issue #2406)', async () => {
      provider.wrapTool(mockTool, mockExecuteToolFn);
      const handler = (tool as unknown as MockedToolFn).mock.calls[0][3];

      const params = { to: 'test@example.com', subject: 'Test', body: 'Hello' };
      await handler(JSON.stringify(params));

      expect(mockExecuteToolFn).toHaveBeenCalledWith(mockTool.slug, params);
    });

    it('should surface a typed error for a malformed-JSON string input (issue #2406)', async () => {
      provider.wrapTool(mockTool, mockExecuteToolFn);
      const handler = (tool as unknown as MockedToolFn).mock.calls[0][3];

      const result = await handler('{"to":');

      expect(mockExecuteToolFn).not.toHaveBeenCalled();
      expect(JSON.parse(result.content[0].text)).toMatchObject({
        successful: false,
        error: expect.stringContaining('not valid JSON'),
      });
    });

    it('should handle string results from tool execution', async () => {
      (mockExecuteToolFn as unknown as MockResolvableWithAnyValue).mockResolvedValueOnce(
        'Simple string result'
      );
      provider.wrapTool(mockTool, mockExecuteToolFn);

      const handler = (tool as unknown as MockedToolFn).mock.calls[0][3];
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

    it('should handle undefined results from tool execution and convert to "null" string', async () => {
      (mockExecuteToolFn as unknown as MockResolvableWithAnyValue).mockResolvedValueOnce(undefined);
      provider.wrapTool(mockTool, mockExecuteToolFn);

      const handler = (tool as unknown as MockedToolFn).mock.calls[0][3];
      const result = await handler({ to: 'test@example.com', subject: 'Test', body: 'Hello' });

      // text should always be a string, never undefined
      expect(result.content[0].text).toBe('');
      expect(typeof result.content[0].text).toBe('string');
    });

    it('should handle errors from tool execution and return formatted error response', async () => {
      const testError = new Error('Test execution error');
      mockExecuteToolFn.mockRejectedValueOnce(testError);
      provider.wrapTool(mockTool, mockExecuteToolFn);

      const handler = (tool as unknown as MockedToolFn).mock.calls[0][3];
      const result = await handler({ to: 'test@example.com', subject: 'Test', body: 'Hello' });

      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');

      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.successful).toBe(false);
      expect(errorResponse.error).toBe('Test execution error');
      expect(errorResponse.data).toBe(null);
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
