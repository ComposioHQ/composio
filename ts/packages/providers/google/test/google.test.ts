import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleProvider } from '../src';
import { Tool } from '@composio/core';

describe('GoogleProvider', () => {
  let provider: GoogleProvider;
  let mockTool: Tool;
  let mockExecuteToolFn: unknown;

  beforeEach(() => {
    provider = new GoogleProvider();

    mockExecuteToolFn = vi.fn().mockResolvedValue({
      data: { result: 'success' },
      error: null,
      successful: true,
    });
    provider._setExecuteToolFn(mockExecuteToolFn);

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

    vi.clearAllMocks();
  });

  describe('name property', () => {
    it('should have the correct name', () => {
      expect(provider.name).toBe('google');
    });
  });

  describe('_isAgentic property', () => {
    it('should be non-agentic', () => {
      expect(provider._isAgentic).toBe(false);
    });
  });

  describe('wrapTool', () => {
    it('should wrap a tool in Google GenAI function declaration format', () => {
      const wrapped = provider.wrapTool(mockTool);

      expect(wrapped).toEqual({
        name: mockTool.slug,
        description: mockTool.description,
        parameters: {
          type: 'object',
          description: mockTool.description,
          properties: mockTool.inputParameters?.properties || {},
          required: mockTool.inputParameters?.required || [],
        },
      });
    });

    it('should handle tools without input parameters', () => {
      const toolWithoutParams: Tool = {
        ...mockTool,
        inputParameters: undefined,
      };

      const wrapped = provider.wrapTool(toolWithoutParams);

      expect(wrapped).toEqual({
        name: toolWithoutParams.slug,
        description: toolWithoutParams.description,
        parameters: {
          type: 'object',
          description: toolWithoutParams.description,
          properties: {},
          required: [],
        },
      });
    });

    it('deduplicates required entries for directly wrapped tools', () => {
      const wrapped = provider.wrapTool({
        ...mockTool,
        inputParameters: {
          ...mockTool.inputParameters!,
          required: ['input', 'input'],
        },
      });

      expect(wrapped.parameters?.required).toEqual(['input']);
    });

    it('normalizes nested object schemas without treating property maps as schemas', () => {
      const wrapped = provider.wrapTool({
        ...mockTool,
        inputParameters: {
          type: 'object',
          properties: {
            properties: {
              properties: { name: { type: 'string' } },
            },
          },
        },
      });

      const params = wrapped.parameters as unknown as {
        properties: Record<string, unknown>;
      };
      expect(params.properties).toEqual({
        properties: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
      });
      expect(params.properties).not.toHaveProperty('type');
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

      const wrapped = provider.wrapTools(tools);

      expect(wrapped).toHaveLength(2);

      expect(wrapped[0]).toEqual({
        name: mockTool.slug,
        description: mockTool.description,
        parameters: {
          type: 'object',
          description: mockTool.description,
          properties: mockTool.inputParameters?.properties || {},
          required: mockTool.inputParameters?.required || [],
        },
      });

      expect(wrapped[1]).toEqual({
        name: anotherTool.slug,
        description: anotherTool.description,
        parameters: {
          type: 'object',
          description: anotherTool.description,
          properties: anotherTool.inputParameters?.properties || {},
          required: anotherTool.inputParameters?.required || [],
        },
      });
    });

    it('should return an empty array for empty tools array', () => {
      const wrapped = provider.wrapTools([]);
      expect(wrapped).toEqual([]);
    });
  });

  describe('executeToolCall', () => {
    it('should execute a tool call and return the result as string', async () => {
      const userId = 'test-user';
      const toolCall = {
        name: 'test-tool',
        args: { input: 'test-value' },
      };

      const result = await provider.executeToolCall(userId, toolCall);

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

    it('should normalize a stringified-JSON args into an object before executing (issue #2406)', async () => {
      const args = { input: 'test-value' };
      const toolCall = { name: 'test-tool', args: JSON.stringify(args) as unknown as object };

      await provider.executeToolCall('test-user', toolCall);

      expect(mockExecuteToolFn).toHaveBeenCalledWith(
        'test-tool',
        expect.objectContaining({ arguments: args }),
        undefined
      );
    });

    it('should throw a typed error for malformed-JSON args (issue #2406)', async () => {
      const toolCall = { name: 'test-tool', args: 'not json' as unknown as object };

      await expect(provider.executeToolCall('test-user', toolCall)).rejects.toThrow(
        /not valid JSON/
      );
    });

    it('should pass options to executeTool', async () => {
      const userId = 'test-user';
      const toolCall = {
        name: 'test-tool',
        args: { input: 'test-value' },
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

  describe('executeToolCall with a Tool Router session', () => {
    it('keeps user ID calls working on @composio/core releases without session helpers', async () => {
      // The peer range admits cores that predate executeToolForTarget.
      Object.defineProperty(provider, 'executeToolForTarget', { value: undefined });

      await provider.executeToolCall('test-user', { name: 'test-tool', args: {} });

      expect(mockExecuteToolFn).toHaveBeenCalledWith(
        'test-tool',
        expect.objectContaining({ userId: 'test-user' }),
        undefined
      );
    });

    it('executes through the session instead of the direct tools API', async () => {
      const session = {
        execute: vi.fn().mockResolvedValue({
          data: { result: 'session-success' },
          error: null,
          logId: 'log-session',
          resultType: 'completed',
        }),
      };

      const result = await provider.executeToolCall(session, {
        name: 'COMPOSIO_SEARCH_TOOLS',
        args: { query: 'send an email' },
      });

      expect(session.execute).toHaveBeenCalledWith('COMPOSIO_SEARCH_TOOLS', {
        query: 'send an email',
      });
      expect(mockExecuteToolFn).not.toHaveBeenCalled();
      expect(JSON.parse(result)).toEqual({
        data: { result: 'session-success' },
        error: null,
        logId: 'log-session',
        resultType: 'completed',
        successful: true,
      });
    });

    it('reports a failed session execution in the result', async () => {
      const session = {
        execute: vi.fn().mockResolvedValue({
          data: {},
          error: 'Tool failed',
          logId: 'log-fail',
          resultType: 'failed',
        }),
      };

      const result = await provider.executeToolCall(session, {
        name: 'COMPOSIO_SEARCH_TOOLS',
        args: {},
      });

      expect(JSON.parse(result)).toMatchObject({ error: 'Tool failed', successful: false });
    });

    it('rejects direct execution options with a session', async () => {
      const session = { execute: vi.fn() };

      await expect(
        provider.executeToolCall(
          // @ts-expect-error direct execution options are not accepted with a session
          session,
          { name: 'COMPOSIO_SEARCH_TOOLS', args: {} },
          { connectedAccountId: 'conn-123' }
        )
      ).rejects.toThrow(
        'Direct execution options and modifiers cannot be used with a Tool Router session'
      );
      expect(session.execute).not.toHaveBeenCalled();
    });
  });
});
