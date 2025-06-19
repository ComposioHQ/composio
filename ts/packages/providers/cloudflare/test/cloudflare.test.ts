import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudflareProvider } from '../src';
import { Tool } from '@composio/core';

// Instead of importing and mocking the actual Cloudflare types, let's define our own for testing
interface AiTextGenerationFunction {
  name: string;
  description: string;
  parameters: any;
}

interface MockedCloudflareToolInput {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: any;
  };
}

// Mock the types we need from Cloudflare
vi.mock('@cloudflare/workers-types', () => {
  return {};
});

describe('CloudflareProvider', () => {
  let provider: CloudflareProvider;
  let mockTool: Tool;
  let mockExecuteToolFn: any;

  beforeEach(() => {
    provider = new CloudflareProvider();

    // Mock the global execute tool function
    mockExecuteToolFn = vi.fn().mockResolvedValue({
      data: { result: 'success' },
      error: null,
      successful: true,
    });
    provider._setExecuteToolFn(mockExecuteToolFn);

    // Create a mock Composio tool
    mockTool = {
      slug: 'test-tool',
      name: 'Test Tool',
      description: 'A tool for testing',
      inputParameters: {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'Test input',
          },
        },
        required: ['input'],
      },
      tags: [],
    };

    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('name property', () => {
    it('should have the correct name', () => {
      expect(provider.name).toBe('cloudflare');
    });
  });

  describe('_isAgentic property', () => {
    it('should be non-agentic', () => {
      expect(provider._isAgentic).toBe(false);
    });
  });

  describe('wrapTool', () => {
    it('should wrap a tool in Cloudflare AiTextGenerationToolInput format', () => {
      const wrapped = provider.wrapTool(mockTool) as MockedCloudflareToolInput;

      expect(wrapped).toEqual({
        type: 'function',
        function: {
          name: mockTool.slug,
          description: mockTool.description,
          parameters: mockTool.inputParameters,
        },
      });
    });

    it('should handle tools without input parameters', () => {
      const toolWithoutParams: Tool = {
        ...mockTool,
        inputParameters: undefined,
      };

      // This would normally throw an error due to the type casting in the function,
      // but we're testing the behavior, not the types
      const wrapped = provider.wrapTool(toolWithoutParams) as MockedCloudflareToolInput;

      expect(wrapped).toEqual({
        type: 'function',
        function: {
          name: toolWithoutParams.slug,
          description: toolWithoutParams.description,
          parameters: undefined,
        },
      });
    });

    it('should handle tools without description', () => {
      const toolWithoutDescription: Tool = {
        ...mockTool,
        description: undefined,
      };

      const wrapped = provider.wrapTool(toolWithoutDescription) as MockedCloudflareToolInput;

      expect(wrapped).toEqual({
        type: 'function',
        function: {
          name: toolWithoutDescription.slug,
          description: undefined,
          parameters: toolWithoutDescription.inputParameters,
        },
      });
    });
  });

  describe('wrapTools', () => {
    it('should wrap multiple tools into a dictionary', () => {
      const anotherTool: Tool = {
        ...mockTool,
        slug: 'another-tool',
        name: 'Another Tool',
      };
      const tools = [mockTool, anotherTool];

      const wrapped = provider.wrapTools(tools);

      // Verify the result has the expected properties
      expect(Object.keys(wrapped)).toHaveLength(2);
      expect(wrapped['test-tool']).toBeDefined();
      expect(wrapped['another-tool']).toBeDefined();

      // Verify each tool was properly wrapped
      expect(wrapped['test-tool']).toEqual({
        type: 'function',
        function: {
          name: mockTool.slug,
          description: mockTool.description,
          parameters: mockTool.inputParameters,
        },
      });

      expect(wrapped['another-tool']).toEqual({
        type: 'function',
        function: {
          name: anotherTool.slug,
          description: anotherTool.description,
          parameters: anotherTool.inputParameters,
        },
      });
    });

    it('should return an empty object for empty tools array', () => {
      const wrapped = provider.wrapTools([]);
      expect(wrapped).toEqual({});
    });
  });

  describe('executeToolCall', () => {
    it('should execute a tool call and return the result as string', async () => {
      const userId = 'test-user';
      const toolCall = {
        name: 'test-tool',
        arguments: { input: 'test-value' },
      };

      const result = await provider.executeToolCall(userId, toolCall, {});

      expect(mockExecuteToolFn).toHaveBeenCalledWith(
        'test-tool',
        {
          arguments: { input: 'test-value' },
          userId: 'test-user',
          connectedAccountId: undefined,
          customAuthParams: undefined,
        },
        undefined
      );
      expect(result).toBe(
        JSON.stringify({
          data: { result: 'success' },
          error: null,
          successful: true,
        })
      );
    });

    it('should handle string arguments by parsing them', async () => {
      const userId = 'test-user';
      const toolCall = {
        name: 'test-tool',
        arguments: JSON.stringify({ input: 'test-value' }),
      };

      const result = await provider.executeToolCall(userId, toolCall, {});

      expect(mockExecuteToolFn).toHaveBeenCalledWith(
        'test-tool',
        {
          arguments: { input: 'test-value' },
          userId: 'test-user',
          connectedAccountId: undefined,
          customAuthParams: undefined,
        },
        undefined
      );
      expect(result).toBe(
        JSON.stringify({
          data: { result: 'success' },
          error: null,
          successful: true,
        })
      );
    });

    it('should pass options to executeTool', async () => {
      const userId = 'test-user';
      const toolCall = {
        name: 'test-tool',
        arguments: { input: 'test-value' },
      };

      const options = {
        connectedAccountId: 'conn-123',
        customAuthParams: {
          parameters: [{ name: 'token', value: 'abc123', in: 'header' as const }],
        },
      };

      const modifiers = {
        beforeExecute: vi.fn(({ params }) => params),
        afterExecute: vi.fn(({ result }) => result),
      };

      await provider.executeToolCall(userId, toolCall, options, modifiers);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(
        'test-tool',
        {
          arguments: { input: 'test-value' },
          userId: 'test-user',
          connectedAccountId: 'conn-123',
          customAuthParams: options.customAuthParams,
        },
        modifiers
      );
    });
  });

  describe('executeTool', () => {
    it('should execute a tool using the global execute function', async () => {
      const toolSlug = 'test-tool';
      const toolParams = {
        userId: 'test-user',
        arguments: { input: 'test-value' },
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
      const toolSlug = 'test-tool';
      const toolParams = {
        userId: 'test-user',
        arguments: { input: 'test-value' },
      };

      const modifiers = {
        beforeExecute: vi.fn(({ params }) => params),
        afterExecute: vi.fn(({ result }) => result),
      };

      await provider.executeTool(toolSlug, toolParams, modifiers);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(toolSlug, toolParams, modifiers);
    });
  });

  describe('integration with Cloudflare AI', () => {
    it('should produce tools compatible with Cloudflare AI', () => {
      const wrapped = provider.wrapTool(mockTool) as MockedCloudflareToolInput;

      // Verify the wrapped tool has the expected structure
      expect(wrapped).toHaveProperty('type', 'function');
      expect(wrapped).toHaveProperty('function');
      expect(wrapped.function).toHaveProperty('name', mockTool.slug);
      expect(wrapped.function).toHaveProperty('description', mockTool.description);
      expect(wrapped.function).toHaveProperty('parameters', mockTool.inputParameters);

      // The structure should match what Cloudflare AI expects
      expect(wrapped.type).toBe('function');
    });
  });
});
