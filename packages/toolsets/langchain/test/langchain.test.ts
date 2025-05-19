import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LangchainToolset } from '../src';
import { Tool } from '@composio/core';
import { DynamicStructuredTool } from '@langchain/core/tools';

// Define an interface for our mocked LangChain tool
interface MockedLangChainTool extends DynamicStructuredTool {
  _isMockedLangChainTool: boolean;
}

// Mock the @langchain/core/tools module
vi.mock('@langchain/core/tools', () => {
  return {
    DynamicStructuredTool: vi.fn().mockImplementation(config => {
      return {
        name: config.name,
        description: config.description,
        schema: config.schema,
        func: config.func,
        _isMockedLangChainTool: true,
      } as MockedLangChainTool;
    }),
  };
});

// Mock the jsonSchemaToModel function from @composio/core
vi.mock('@composio/core', async () => {
  const actual = await vi.importActual('@composio/core');
  return {
    ...(actual as object),
    jsonSchemaToModel: vi.fn().mockImplementation(schema => {
      return { type: 'mock-schema', originalSchema: schema };
    }),
  };
});

describe('LangchainToolset', () => {
  let toolset: LangchainToolset;
  let mockTool: Tool;
  let mockExecuteToolFn: any;

  beforeEach(() => {
    toolset = new LangchainToolset();

    // Mock the global execute tool function
    mockExecuteToolFn = vi.fn().mockResolvedValue({
      data: { result: 'success' },
      error: null,
      successful: true,
    });
    toolset._setExecuteToolFn(mockExecuteToolFn);

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
      toolkit: {
        slug: 'test-toolkit',
        name: 'Test Toolkit',
      },
      tags: [],
    };

    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('name property', () => {
    it('should have the correct name', () => {
      expect(toolset.name).toBe('langchain');
    });
  });

  describe('_isAgentic property', () => {
    it('should be agentic', () => {
      expect(toolset._isAgentic).toBe(true);
    });
  });

  describe('wrapTool', () => {
    it('should wrap a tool in LangChain DynamicStructuredTool format', () => {
      const wrapped = toolset.wrapTool(mockTool, mockExecuteToolFn) as MockedLangChainTool;

      expect(DynamicStructuredTool).toHaveBeenCalledWith({
        name: mockTool.slug,
        description: mockTool.description,
        schema: expect.objectContaining({
          type: 'mock-schema',
          originalSchema: mockTool.inputParameters,
        }),
        func: expect.any(Function),
      });

      expect(wrapped._isMockedLangChainTool).toBe(true);
    });

    it('should throw an error if toolkit name is not defined', () => {
      const toolWithoutToolkit: Tool = {
        ...mockTool,
        toolkit: undefined,
      };

      expect(() => {
        toolset.wrapTool(toolWithoutToolkit, mockExecuteToolFn);
      }).toThrow('App name is not defined');
    });

    it('should throw an error if inputParameters are not defined', () => {
      const toolWithoutParams: Tool = {
        ...mockTool,
        inputParameters: undefined,
      };

      expect(() => {
        toolset.wrapTool(toolWithoutParams, mockExecuteToolFn);
      }).toThrow('Tool input parameters are not defined');
    });

    it('should create a function that executes the tool with the right parameters', async () => {
      const wrapped = toolset.wrapTool(mockTool, mockExecuteToolFn);

      // Extract the function from the constructor call
      const executeFunction = (DynamicStructuredTool as any).mock.calls[0][0].func;

      // Test the execute function
      const params = { input: 'test-value' };
      const result = await executeFunction(params);

      // Check that executeToolFn was called with the right parameters
      expect(mockExecuteToolFn).toHaveBeenCalledWith(mockTool.slug, params);

      // Check that the result was stringified
      expect(result).toBe(
        JSON.stringify({
          data: { result: 'success' },
          error: null,
          successful: true,
        })
      );
    });
  });

  describe('wrapTools', () => {
    it('should wrap multiple tools', () => {
      const anotherTool: Tool = {
        ...mockTool,
        slug: 'another-tool',
        name: 'Another Tool',
      };
      const tools = [mockTool, anotherTool];

      const wrapped = toolset.wrapTools(tools, mockExecuteToolFn);

      // Verify the result is an array of the right length
      expect(wrapped).toHaveLength(2);

      // Verify the DynamicStructuredTool constructor was called with the right parameters for each tool
      expect(DynamicStructuredTool).toHaveBeenCalledTimes(2);
      expect(DynamicStructuredTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: mockTool.slug,
        })
      );
      expect(DynamicStructuredTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: anotherTool.slug,
        })
      );
    });

    it('should return an empty array for empty tools array', () => {
      const wrapped = toolset.wrapTools([], mockExecuteToolFn);
      expect(wrapped).toEqual([]);
      expect(DynamicStructuredTool).not.toHaveBeenCalled();
    });
  });

  describe('executeTool', () => {
    it('should execute a tool using the global execute function', async () => {
      const toolSlug = 'test-tool';
      const toolParams = {
        userId: 'test-user',
        arguments: { input: 'test-value' },
      };

      const result = await toolset.executeTool(toolSlug, toolParams);

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
        beforeToolExecute: vi.fn(params => params),
        afterToolExecute: vi.fn(response => response),
      };

      await toolset.executeTool(toolSlug, toolParams, modifiers);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(toolSlug, toolParams, modifiers);
    });
  });

  describe('integration with LangChain', () => {
    it('should produce tools compatible with LangChain', () => {
      const wrapped = toolset.wrapTool(mockTool, mockExecuteToolFn) as MockedLangChainTool;

      // Verify the wrapped tool has the expected structure
      expect(wrapped).toHaveProperty('name');
      expect(wrapped).toHaveProperty('description');
      expect(wrapped).toHaveProperty('schema');
      expect(wrapped).toHaveProperty('func');

      // The func property should be a function
      expect(typeof wrapped.func).toBe('function');
    });
  });
});
