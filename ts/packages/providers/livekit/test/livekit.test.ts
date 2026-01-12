import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Tool } from '@composio/core';
import { LivekitProvider } from '../src';

// Mock the @livekit/agents module
vi.mock('@livekit/agents', () => {
  return {
    llm: {
      tool: vi.fn().mockImplementation(config => {
        return {
          description: config.description,
          parameters: config.parameters,
          execute: config.execute,
          _isMockedLivekitTool: true,
        };
      }),
    },
  };
});

// Import mocked functions for assertions
import { llm } from '@livekit/agents';

// Define interface for mocked tool
interface MockedLivekitTool {
  description: string;
  parameters: any;
  execute: Function;
  _isMockedLivekitTool: boolean;
}

describe('LivekitProvider', () => {
  let provider: LivekitProvider;
  let mockTool: Tool;
  let mockExecuteToolFn: any;

  beforeEach(() => {
    provider = new LivekitProvider();

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
      expect(provider.name).toBe('livekit');
    });
  });

  describe('_isAgentic property', () => {
    it('should be agentic', () => {
      expect(provider._isAgentic).toBe(true);
    });
  });

  describe('wrapTool', () => {
    it('should wrap a tool in LiveKit Agent LLM tool format', () => {
      const wrapped = provider.wrapTool(
        mockTool,
        mockExecuteToolFn
      ) as unknown as MockedLivekitTool;

      expect(llm.tool).toHaveBeenCalledWith(
        expect.objectContaining({
          description: mockTool.description,
          parameters: expect.any(Object),
          execute: expect.any(Function),
        })
      );

      expect(wrapped._isMockedLivekitTool).toBe(true);
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
      ) as unknown as MockedLivekitTool;

      expect(llm.tool).toHaveBeenCalledWith(
        expect.objectContaining({
          description: toolWithoutParams.description,
          parameters: expect.any(Object),
          execute: expect.any(Function),
        })
      );
      expect(wrapped._isMockedLivekitTool).toBe(true);
    });

    it('should handle tools without description', () => {
      const toolWithoutDescription: Tool = {
        ...mockTool,
        description: undefined,
      };

      const wrapped = provider.wrapTool(
        toolWithoutDescription,
        mockExecuteToolFn
      ) as unknown as MockedLivekitTool;

      expect(llm.tool).toHaveBeenCalledWith(
        expect.objectContaining({
          description: `Execute ${toolWithoutDescription.slug}`,
          parameters: expect.any(Object),
          execute: expect.any(Function),
        })
      );
      expect(wrapped._isMockedLivekitTool).toBe(true);
    });

    it('should create an execute function that calls the tool with correct parameters', async () => {
      provider.wrapTool(mockTool, mockExecuteToolFn);

      // Extract the execute function from the call to llm.tool()
      const executeConfig = (llm.tool as any).mock.calls[0][0];
      const execute = executeConfig.execute;

      // Test the execute function
      const params = { to: 'test@example.com', subject: 'Test', body: 'Hello' };
      const result = await execute(params);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(mockTool.slug, params);
      expect(result).toBe(
        JSON.stringify({
          data: { result: 'success' },
          error: null,
          successful: true,
        })
      );
    });

    it('should handle string results from tool execution', async () => {
      mockExecuteToolFn.mockResolvedValueOnce('Simple string result');
      provider.wrapTool(mockTool, mockExecuteToolFn);

      const executeConfig = (llm.tool as any).mock.calls[0][0];
      const execute = executeConfig.execute;
      const result = await execute({ to: 'test@example.com', subject: 'Test', body: 'Hello' });

      expect(result).toBe('Simple string result');
    });

    it('should handle errors from tool execution and return formatted error response', async () => {
      const testError = new Error('Test execution error');
      mockExecuteToolFn.mockRejectedValueOnce(testError);
      provider.wrapTool(mockTool, mockExecuteToolFn);

      const executeConfig = (llm.tool as any).mock.calls[0][0];
      const execute = executeConfig.execute;
      const result = await execute({ to: 'test@example.com', subject: 'Test', body: 'Hello' });

      const errorResponse = JSON.parse(result);
      expect(errorResponse.successful).toBe(false);
      expect(errorResponse.error).toBe('Test execution error');
      expect(errorResponse.data).toBe(null);
    });

    it('should handle non-Error objects thrown during execution', async () => {
      mockExecuteToolFn.mockRejectedValueOnce('String error');
      provider.wrapTool(mockTool, mockExecuteToolFn);

      const executeConfig = (llm.tool as any).mock.calls[0][0];
      const execute = executeConfig.execute;
      const result = await execute({ to: 'test@example.com', subject: 'Test', body: 'Hello' });

      const errorResponse = JSON.parse(result);
      expect(errorResponse.successful).toBe(false);
      expect(errorResponse.error).toBe('String error');
      expect(errorResponse.data).toBe(null);
    });
  });

  describe('wrapTools', () => {
    it('should wrap multiple tools with camelCase keys', () => {
      const anotherTool: Tool = {
        ...mockTool,
        slug: 'SLACK_POST_MESSAGE',
        name: 'Slack Post Message',
        description: 'Post a message to Slack',
      };
      const tools = [mockTool, anotherTool];

      const wrapped = provider.wrapTools(tools, mockExecuteToolFn);

      expect(Object.keys(wrapped)).toEqual(['gmailSendEmail', 'slackPostMessage']);
      expect(llm.tool).toHaveBeenCalledTimes(2);
    });

    it('should return an empty object for empty tools array', () => {
      const wrapped = provider.wrapTools([], mockExecuteToolFn);
      expect(wrapped).toEqual({});
      expect(llm.tool).not.toHaveBeenCalled();
    });

    it('should convert various slug formats to camelCase', () => {
      const toolsWithVariousSlugs: Tool[] = [
        { ...mockTool, slug: 'SIMPLE' },
        { ...mockTool, slug: 'TWO_WORDS' },
        { ...mockTool, slug: 'THREE_WORD_SLUG' },
        { ...mockTool, slug: 'MANY_MANY_MANY_WORDS' },
      ];

      const wrapped = provider.wrapTools(toolsWithVariousSlugs, mockExecuteToolFn);

      expect(Object.keys(wrapped)).toEqual([
        'simple',
        'twoWords',
        'threeWordSlug',
        'manyManyManyWords',
      ]);
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

    it('should handle empty MCP URL response', () => {
      const result = provider.wrapMcpServerResponse([]);
      expect(result).toEqual([]);
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
          },
          required: ['stringProp'],
        },
      };

      const wrapped = provider.wrapTool(toolWithVariousTypes, mockExecuteToolFn);

      // Verify tool was called (schema conversion happened without error)
      expect(llm.tool).toHaveBeenCalled();
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

      expect(llm.tool).toHaveBeenCalled();
      expect(wrapped).toBeDefined();
    });
  });
});
