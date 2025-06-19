import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgenticProvider, BaseNonAgenticProvider } from '../../src/provider/BaseProvider';
import { Tool, ToolExecuteParams, ToolExecuteResponse } from '../../src/types/tool.types';
import { ExecuteToolFn } from '../../src/types/provider.types';
import { ComposioGlobalExecuteToolFnNotSetError } from '../../src/errors/ToolErrors';

// Mock implementations of the abstract classes for testing
class MockNonAgenticProvider extends BaseNonAgenticProvider<string[], string> {
  readonly name = 'MockNonAgenticProvider';

  wrapTool = vi.fn((tool: Tool): string => {
    return `wrapped-non-agentic-tool:${tool.slug}`;
  });

  wrapTools = vi.fn((tools: Tool[]): string[] => {
    return tools.map(tool => this.wrapTool(tool));
  });
}

class MockAgenticProvider extends BaseAgenticProvider<string[], string> {
  readonly name = 'MockAgenticProvider';

  wrapTool = vi.fn((tool: Tool, executeTool: ExecuteToolFn): string => {
    return `wrapped-agentic-tool:${tool.slug}`;
  });

  wrapTools = vi.fn((tools: Tool[], executeTool: ExecuteToolFn): string[] => {
    return tools.map(tool => this.wrapTool(tool, executeTool));
  });
}

describe('BaseProvider', () => {
  describe('BaseNonAgenticProvider', () => {
    let nonAgenticProvider: MockNonAgenticProvider;

    beforeEach(() => {
      nonAgenticProvider = new MockNonAgenticProvider();
      nonAgenticProvider._setExecuteToolFn(
        vi.fn().mockResolvedValue({
          data: { result: 'success' },
          error: null,
          successful: true,
        })
      );
      vi.resetAllMocks();
    });

    it('should have _isAgentic property set to false', () => {
      expect(nonAgenticProvider._isAgentic).toBe(false);
    });

    it('should have the correct name', () => {
      expect(nonAgenticProvider.name).toBe('MockNonAgenticProvider');
    });

    it('should wrap a single tool correctly', () => {
      const mockTool: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A tool for testing',
        tags: [],
      };

      const wrapped = nonAgenticProvider.wrapTool(mockTool);

      expect(nonAgenticProvider.wrapTool).toHaveBeenCalledWith(mockTool);
      expect(wrapped).toBe('wrapped-non-agentic-tool:test-tool');
    });

    it('should wrap multiple tools correctly', () => {
      const mockTools: Tool[] = [
        {
          slug: 'tool-1',
          name: 'Tool One',
          description: 'First test tool',
          tags: [],
        },
        {
          slug: 'tool-2',
          name: 'Tool Two',
          description: 'Second test tool',
          tags: [],
        },
      ];

      const wrapped = nonAgenticProvider.wrapTools(mockTools);

      expect(nonAgenticProvider.wrapTools).toHaveBeenCalledWith(mockTools);
      expect(wrapped).toEqual([
        'wrapped-non-agentic-tool:tool-1',
        'wrapped-non-agentic-tool:tool-2',
      ]);
    });

    it('should execute a tool using the global execute function', async () => {
      // Create a mock for the global execute function
      const mockGlobalExecute = vi.fn().mockResolvedValue({
        data: { result: 'success' },
        error: null,
        successful: true,
      });

      // Set the execute function
      nonAgenticProvider._setExecuteToolFn(mockGlobalExecute);

      // Execute a tool
      const toolSlug = 'test-tool';
      const toolParams: ToolExecuteParams = {
        userId: 'test-user',
        arguments: { query: 'test' },
      };
      const modifiers = {
        beforeExecute: vi.fn(({ params }) => params),
        afterExecute: vi.fn(({ result }) => result),
      };

      const result = await nonAgenticProvider.executeTool(toolSlug, toolParams, modifiers);

      // Verify the global execute function was called with the correct parameters
      expect(mockGlobalExecute).toHaveBeenCalledWith(toolSlug, toolParams, modifiers);
      expect(result).toEqual({
        data: { result: 'success' },
        error: null,
        successful: true,
      });
    });
  });

  describe('BaseAgenticProvider', () => {
    let agenticProvider: MockAgenticProvider;
    let mockExecuteTool: ExecuteToolFn;

    beforeEach(() => {
      agenticProvider = new MockAgenticProvider();
      agenticProvider._setExecuteToolFn(
        vi.fn().mockResolvedValue({
          data: { result: 'success' },
          error: null,
          successful: true,
        })
      );
      mockExecuteTool = vi.fn().mockResolvedValue({
        data: { result: 'success' },
        error: null,
        successful: true,
      });
      vi.resetAllMocks();
    });

    it('should have _isAgentic property set to true', () => {
      expect(agenticProvider._isAgentic).toBe(true);
    });

    it('should have the correct name', () => {
      expect(agenticProvider.name).toBe('MockAgenticProvider');
    });

    it('should wrap a single tool correctly with execute function', () => {
      const mockTool: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A tool for testing',
        tags: [],
      };

      const wrapped = agenticProvider.wrapTool(mockTool, mockExecuteTool);

      expect(agenticProvider.wrapTool).toHaveBeenCalledWith(mockTool, mockExecuteTool);
      expect(wrapped).toBe('wrapped-agentic-tool:test-tool');
    });

    it('should wrap multiple tools correctly with execute function', () => {
      const mockTools: Tool[] = [
        {
          slug: 'tool-1',
          name: 'Tool One',
          description: 'First test tool',
          tags: [],
        },
        {
          slug: 'tool-2',
          name: 'Tool Two',
          description: 'Second test tool',
          tags: [],
        },
      ];

      const wrapped = agenticProvider.wrapTools(mockTools, mockExecuteTool);

      expect(agenticProvider.wrapTools).toHaveBeenCalledWith(mockTools, mockExecuteTool);
      expect(wrapped).toEqual(['wrapped-agentic-tool:tool-1', 'wrapped-agentic-tool:tool-2']);
    });

    it('should execute a tool using the global execute function', async () => {
      // Create a mock for the global execute function
      const mockGlobalExecute = vi.fn().mockResolvedValue({
        data: { result: 'success' },
        error: null,
        successful: true,
      });

      // Set the execute function
      agenticProvider._setExecuteToolFn(mockGlobalExecute);

      // Execute a tool
      const toolSlug = 'test-tool';
      const toolParams: ToolExecuteParams = {
        userId: 'test-user',
        arguments: { query: 'test' },
      };
      const modifiers = {
        beforeExecute: vi.fn(({ params }) => params),
        afterExecute: vi.fn(({ result }) => result),
      };

      const result = await agenticProvider.executeTool(toolSlug, toolParams, modifiers);

      // Verify the global execute function was called with the correct parameters
      expect(mockGlobalExecute).toHaveBeenCalledWith(toolSlug, toolParams, modifiers);
      expect(result).toEqual({
        data: { result: 'success' },
        error: null,
        successful: true,
      });
    });
  });

  describe('_setExecuteToolFn', () => {
    it('should throw an error if trying to execute a tool without setting the execute function', async () => {
      const provider = new MockNonAgenticProvider();

      const toolSlug = 'test-tool';
      const toolParams: ToolExecuteParams = {
        userId: 'test-user',
        arguments: { query: 'test' },
      };

      // This should throw an error because _globalExecuteToolFn is not set
      try {
        await provider.executeTool(toolSlug, toolParams);
      } catch (error) {
        expect(error).toBeInstanceOf(ComposioGlobalExecuteToolFnNotSetError);
      }
    });
  });
});
