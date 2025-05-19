import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgenticToolset, BaseNonAgenticToolset } from '../../src/toolset/BaseToolset';
import { Tool, ToolExecuteParams, ToolExecuteResponse } from '../../src/types/tool.types';
import { ExecuteToolFn } from '../../src/types/toolset.types';
import { ComposioGlobalExecuteToolFnNotSetError } from '../../src/errors/ToolErrors';

// Mock implementations of the abstract classes for testing
class MockNonAgenticToolset extends BaseNonAgenticToolset<string[], string> {
  readonly name = 'MockNonAgenticToolset';

  wrapTool = vi.fn((tool: Tool): string => {
    return `wrapped-non-agentic-tool:${tool.slug}`;
  });

  wrapTools = vi.fn((tools: Tool[]): string[] => {
    return tools.map(tool => this.wrapTool(tool));
  });
}

class MockAgenticToolset extends BaseAgenticToolset<string[], string> {
  readonly name = 'MockAgenticToolset';

  wrapTool = vi.fn((tool: Tool, executeTool: ExecuteToolFn): string => {
    return `wrapped-agentic-tool:${tool.slug}`;
  });

  wrapTools = vi.fn((tools: Tool[], executeTool: ExecuteToolFn): string[] => {
    return tools.map(tool => this.wrapTool(tool, executeTool));
  });
}

describe('BaseToolset', () => {
  describe('BaseNonAgenticToolset', () => {
    let nonAgenticToolset: MockNonAgenticToolset;

    beforeEach(() => {
      nonAgenticToolset = new MockNonAgenticToolset();
      nonAgenticToolset._setExecuteToolFn(
        vi.fn().mockResolvedValue({
          data: { result: 'success' },
          error: null,
          successful: true,
        })
      );
      vi.resetAllMocks();
    });

    it('should have _isAgentic property set to false', () => {
      expect(nonAgenticToolset._isAgentic).toBe(false);
    });

    it('should have the correct name', () => {
      expect(nonAgenticToolset.name).toBe('MockNonAgenticToolset');
    });

    it('should wrap a single tool correctly', () => {
      const mockTool: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A tool for testing',
        tags: [],
      };

      const wrapped = nonAgenticToolset.wrapTool(mockTool);

      expect(nonAgenticToolset.wrapTool).toHaveBeenCalledWith(mockTool);
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

      const wrapped = nonAgenticToolset.wrapTools(mockTools);

      expect(nonAgenticToolset.wrapTools).toHaveBeenCalledWith(mockTools);
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
      nonAgenticToolset._setExecuteToolFn(mockGlobalExecute);

      // Execute a tool
      const toolSlug = 'test-tool';
      const toolParams: ToolExecuteParams = {
        userId: 'test-user',
        arguments: { query: 'test' },
      };
      const modifiers = {
        beforeToolExecute: vi.fn(x => x),
        afterToolExecute: vi.fn(x => x),
      };

      const result = await nonAgenticToolset.executeTool(toolSlug, toolParams, modifiers);

      // Verify the global execute function was called with the correct parameters
      expect(mockGlobalExecute).toHaveBeenCalledWith(toolSlug, toolParams, modifiers);
      expect(result).toEqual({
        data: { result: 'success' },
        error: null,
        successful: true,
      });
    });
  });

  describe('BaseAgenticToolset', () => {
    let agenticToolset: MockAgenticToolset;
    let mockExecuteTool: ExecuteToolFn;

    beforeEach(() => {
      agenticToolset = new MockAgenticToolset();
      agenticToolset._setExecuteToolFn(
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
      expect(agenticToolset._isAgentic).toBe(true);
    });

    it('should have the correct name', () => {
      expect(agenticToolset.name).toBe('MockAgenticToolset');
    });

    it('should wrap a single tool correctly with execute function', () => {
      const mockTool: Tool = {
        slug: 'test-tool',
        name: 'Test Tool',
        description: 'A tool for testing',
        tags: [],
      };

      const wrapped = agenticToolset.wrapTool(mockTool, mockExecuteTool);

      expect(agenticToolset.wrapTool).toHaveBeenCalledWith(mockTool, mockExecuteTool);
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

      const wrapped = agenticToolset.wrapTools(mockTools, mockExecuteTool);

      expect(agenticToolset.wrapTools).toHaveBeenCalledWith(mockTools, mockExecuteTool);
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
      agenticToolset._setExecuteToolFn(mockGlobalExecute);

      // Execute a tool
      const toolSlug = 'test-tool';
      const toolParams: ToolExecuteParams = {
        userId: 'test-user',
        arguments: { query: 'test' },
      };
      const modifiers = {
        beforeToolExecute: vi.fn(x => x),
        afterToolExecute: vi.fn(x => x),
      };

      const result = await agenticToolset.executeTool(toolSlug, toolParams, modifiers);

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
      const toolset = new MockNonAgenticToolset();

      const toolSlug = 'test-tool';
      const toolParams: ToolExecuteParams = {
        userId: 'test-user',
        arguments: { query: 'test' },
      };

      // This should throw an error because _globalExecuteToolFn is not set
      try {
        await toolset.executeTool(toolSlug, toolParams);
      } catch (error) {
        expect(error).toBeInstanceOf(ComposioGlobalExecuteToolFnNotSetError);
      }
    });
  });
});
