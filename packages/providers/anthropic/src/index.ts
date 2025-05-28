/**
 * Anthropic Provider
 *
 * This provider provides a set of tools for interacting with Anthropic's API.
 * It implements the non-agentic provider interface for Anthropic's Claude models.
 *
 * @packageDocumentation
 * @module providers/anthropic
 */
import {
  BaseNonAgenticProvider,
  Tool as ComposioTool,
  ExecuteToolModifiers,
  ExecuteToolFnOptions,
  ToolExecuteParams,
  logger,
} from '@composio/core';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicTool, InputSchema } from './types';

/**
 * Collection of Anthropic tools
 */
export type AnthropicToolCollection = AnthropicTool[];

/**
 * Type for Anthropic tool use block in message content
 */
export interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Type for Anthropic message content block
 */
export type AnthropicContentBlock = {
  type: string;
  [key: string]: unknown;
};

/**
 * Anthropic Provider implementation for Composio
 */
export class AnthropicProvider extends BaseNonAgenticProvider<
  AnthropicToolCollection,
  AnthropicTool
> {
  readonly name = 'anthropic';
  private chacheTools: boolean = false;

  constructor(options?: { cacheTools?: boolean }) {
    super();
    this.chacheTools = options?.cacheTools ?? false;
    logger.debug(`AnthropicProvider initialized [cacheTools: ${this.chacheTools}]`);
  }

  /**
   * Wrap a tool in the Anthropic format.
   * @param tool - The tool to wrap.
   * @returns The wrapped tool in Anthropic format.
   */
  override wrapTool(tool: ComposioTool): AnthropicTool {
    return {
      name: tool.slug,
      description: tool.description || '',
      input_schema: (tool.inputParameters || {
        type: 'object',
        properties: {},
        required: [],
      }) as InputSchema,
      cache_control: this.chacheTools ? { type: 'ephemeral' } : undefined,
    };
  }

  /**
   * Wrap a list of tools in the Anthropic format.
   * @param tools - The tools to wrap.
   * @returns The wrapped tools in Anthropic format.
   */
  override wrapTools(tools: ComposioTool[]): AnthropicToolCollection {
    return tools.map(tool => this.wrapTool(tool));
  }

  /**
   * Execute a tool call from Anthropic.
   * @param userId - The user ID
   * @param toolUse - The tool use object from Anthropic
   * @param options - Additional options for tool execution
   * @param modifiers - Modifiers for tool execution
   * @returns The result of the tool execution as a string
   */
  async executeToolCall(
    userId: string,
    toolUse: AnthropicToolUseBlock,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<string> {
    const payload: ToolExecuteParams = {
      arguments: toolUse.input,
      connectedAccountId: options?.connectedAccountId,
      customAuthParams: options?.customAuthParams,
      userId: userId,
    };
    const result = await this.executeTool(toolUse.name, payload, modifiers);
    return JSON.stringify(result.data);
  }

  /**
   * Handle tool calls from Anthropic's message response
   * @param userId - The user ID
   * @param message - The message response from Anthropic
   * @param options - Additional options for tool execution
   * @param modifiers - Modifiers for tool execution
   * @returns Array of tool execution results
   */
  async handleToolCalls(
    userId: string,
    message: Anthropic.Message,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<string[]> {
    const outputs: string[] = [];

    // Filter and map tool use blocks from message content
    const toolUseBlocks: AnthropicToolUseBlock[] = [];

    for (const content of message.content) {
      if (
        typeof content === 'object' &&
        content !== null &&
        'type' in content &&
        typeof content.type === 'string' &&
        content.type.toString() === 'tool_use' &&
        'id' in content &&
        'name' in content &&
        'input' in content
      ) {
        toolUseBlocks.push({
          type: 'tool_use',
          id: String(content.id),
          name: String(content.name),
          input: content.input as Record<string, unknown>,
        });
      }
    }

    for (const toolUse of toolUseBlocks) {
      outputs.push(await this.executeToolCall(userId, toolUse, options, modifiers));
    }

    return outputs;
  }
}
