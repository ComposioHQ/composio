/**
 * @file AWS Bedrock Provider implementation for Composio SDK
 * @module providers/bedrock
 * @description
 * This provider enables integration with AWS Bedrock's Converse API,
 * with primary support for Anthropic Claude models. It handles tool wrapping,
 * execution, and result formatting for seamless integration with AWS Lambda
 * and other AWS services using IAM role-based authentication.
 *
 * @copyright Composio 2024
 * @license ISC
 *
 * @see {@link https://docs.composio.dev/providers/bedrock}
 * @see {@link https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html}
 * @see {@link https://docs.anthropic.com/en/api/claude-on-amazon-bedrock}
 *
 * @packageDocumentation
 */
import {
  BaseNonAgenticProvider,
  Tool as ComposioTool,
  ExecuteToolModifiers,
  ExecuteToolFnOptions,
  ToolExecuteParams,
  logger,
} from '@composio/core';
import type { ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { BedrockTool, BedrockToolSpec, BedrockToolUseBlock, InputSchema } from './types';

export * from './types';

/**
 * Collection of Bedrock tools
 */
export type BedrockToolCollection = BedrockTool[];

/**
 * AWS Bedrock Provider implementation for Composio
 *
 * Supports AWS Bedrock's Converse API, primarily targeting Anthropic Claude models.
 * The tool format follows AWS Bedrock's tool specification structure.
 *
 * @example
 * ```typescript
 * import { BedrockProvider } from '@composio/bedrock';
 * import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
 * import { Composio } from '@composio/core';
 *
 * // Initialize the provider
 * const provider = new BedrockProvider();
 *
 * // Use with Composio
 * const composio = new Composio({
 *   apiKey: 'your-api-key',
 *   provider
 * });
 *
 * // Get tools and wrap them for Bedrock
 * const tools = await composio.tools.get('user-id', { toolkits: ['github'] });
 * const bedrockTools = provider.wrapTools(tools);
 *
 * // Use with Bedrock Converse API
 * const client = new BedrockRuntimeClient({ region: 'us-east-1' });
 * const response = await client.send(new ConverseCommand({
 *   modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
 *   messages: [
 *     {
 *       role: 'user',
 *       content: [{ text: 'Create a GitHub repository called test-repo' }]
 *     }
 *   ],
 *   toolConfig: {
 *     tools: bedrockTools
 *   }
 * }));
 *
 * // Handle tool calls
 * if (response.stopReason === 'tool_use') {
 *   const toolResults = await provider.handleToolCalls('user-id', response);
 *   // Continue conversation with tool results...
 * }
 * ```
 */
export class BedrockProvider extends BaseNonAgenticProvider<BedrockToolCollection, BedrockTool> {
  readonly name = 'bedrock';

  /**
   * Creates a new instance of the BedrockProvider.
   *
   * @example
   * ```typescript
   * // Initialize the provider
   * const provider = new BedrockProvider();
   *
   * // Use with Composio
   * const composio = new Composio({
   *   apiKey: 'your-api-key',
   *   provider: new BedrockProvider()
   * });
   * ```
   */
  constructor() {
    super();
    logger.debug('BedrockProvider initialized');
  }

  /**
   * Wraps a Composio tool in the AWS Bedrock format.
   *
   * This method transforms a Composio tool definition into the format
   * expected by AWS Bedrock's Converse API for tool use.
   *
   * @param tool - The Composio tool to wrap
   * @returns The wrapped tool in Bedrock format
   *
   * @example
   * ```typescript
   * // Wrap a single tool for use with Bedrock
   * const composioTool = {
   *   slug: 'GITHUB_CREATE_REPO',
   *   description: 'Create a new GitHub repository',
   *   inputParameters: {
   *     type: 'object',
   *     properties: {
   *       name: { type: 'string', description: 'Repository name' },
   *       private: { type: 'boolean', description: 'Make repository private' }
   *     },
   *     required: ['name']
   *   }
   * };
   *
   * const bedrockTool = provider.wrapTool(composioTool);
   * ```
   */
  override wrapTool(tool: ComposioTool): BedrockTool {
    const toolSpec: BedrockToolSpec = {
      name: tool.slug,
      description: tool.description || '',
      inputSchema: {
        json: (tool.inputParameters || {
          type: 'object',
          properties: {},
          required: [],
        }) as InputSchema,
      },
    };

    return {
      toolSpec,
    };
  }

  /**
   * Wraps a list of Composio tools in the AWS Bedrock format.
   *
   * This method transforms multiple Composio tool definitions into the format
   * expected by AWS Bedrock's Converse API for tool use.
   *
   * @param tools - Array of Composio tools to wrap
   * @returns Array of wrapped tools in Bedrock format
   *
   * @example
   * ```typescript
   * // Wrap multiple tools for use with Bedrock
   * const composioTools = await composio.tools.get('user-id', {
   *   toolkits: ['github', 'slack']
   * });
   *
   * const bedrockTools = provider.wrapTools(composioTools);
   *
   * // Use in Bedrock Converse API
   * const response = await client.send(new ConverseCommand({
   *   modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
   *   messages: [...],
   *   toolConfig: {
   *     tools: bedrockTools
   *   }
   * }));
   * ```
   */
  override wrapTools(tools: ComposioTool[]): BedrockToolCollection {
    return tools.map(tool => this.wrapTool(tool));
  }

  /**
   * Executes a tool call from AWS Bedrock's Converse API.
   *
   * This method processes a tool call from Bedrock's response,
   * executes the corresponding Composio tool, and returns the result.
   *
   * @param userId - The user ID for authentication and tracking
   * @param toolUse - The tool use object from Bedrock
   * @param options - Additional options for tool execution
   * @param modifiers - Modifiers for tool execution
   * @returns The result of the tool execution formatted for Bedrock
   *
   * @example
   * ```typescript
   * // Execute a tool call from Bedrock
   * const toolUse = {
   *   toolUseId: 'tu_abc123',
   *   name: 'GITHUB_CREATE_REPO',
   *   input: {
   *     name: 'test-repo',
   *     private: false
   *   }
   * };
   *
   * const result = await provider.executeToolCall(
   *   'user123',
   *   toolUse,
   *   { connectedAccountId: 'conn_xyz456' }
   * );
   * ```
   */
  async executeToolCall(
    userId: string,
    toolUse: BedrockToolUseBlock,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<{
    toolUseId: string;
    content: Array<{ json?: Record<string, unknown>; text?: string }>;
    status?: 'success' | 'error';
  }> {
    try {
      const payload: ToolExecuteParams = {
        arguments: toolUse.input,
        connectedAccountId: options?.connectedAccountId,
        customAuthParams: options?.customAuthParams,
        customConnectionData: options?.customConnectionData,
        userId: userId,
      };

      const result = await this.executeTool(toolUse.name, payload, modifiers);

      return {
        toolUseId: toolUse.toolUseId,
        content: [{ json: result.data as Record<string, unknown> }],
        status: 'success',
      };
    } catch (error) {
      logger.error('Error executing tool call:', error);
      return {
        toolUseId: toolUse.toolUseId,
        content: [
          {
            text: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        status: 'error',
      };
    }
  }

  /**
   * Handles tool calls from AWS Bedrock's Converse API response.
   *
   * This method processes tool calls from a Bedrock Converse API response,
   * extracts the tool use blocks, executes each tool call, and returns the results
   * formatted for the next API call.
   *
   * @param userId - The user ID for authentication and tracking
   * @param converseOutput - The output from Bedrock's Converse API
   * @param options - Additional options for tool execution
   * @param modifiers - Modifiers for tool execution
   * @returns Array of tool execution results formatted for Bedrock
   *
   * @example
   * ```typescript
   * // Handle tool calls from a Bedrock Converse API response
   * import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
   *
   * const client = new BedrockRuntimeClient({ region: 'us-east-1' });
   *
   * const response = await client.send(new ConverseCommand({
   *   modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
   *   messages: [
   *     {
   *       role: 'user',
   *       content: [{ text: 'Create a GitHub repository called test-repo' }]
   *     }
   *   ],
   *   toolConfig: {
   *     tools: bedrockTools
   *   }
   * }));
   *
   * // Process any tool calls in the response
   * if (response.stopReason === 'tool_use') {
   *   const toolResults = await provider.handleToolCalls(
   *     'user123',
   *     response,
   *     { connectedAccountId: 'conn_xyz456' }
   *   );
   *
   *   // Continue the conversation with tool results
   *   const followUpResponse = await client.send(new ConverseCommand({
   *     modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
   *     messages: [
   *       ...previousMessages,
   *       {
   *         role: 'assistant',
   *         content: response.output.message.content
   *       },
   *       {
   *         role: 'user',
   *         content: toolResults
   *       }
   *     ],
   *     toolConfig: {
   *       tools: bedrockTools
   *     }
   *   }));
   * }
   * ```
   */
  async handleToolCalls(
    userId: string,
    converseOutput: ConverseCommandOutput,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<
    Array<{
      toolUseId: string;
      content: Array<{ json?: Record<string, unknown>; text?: string }>;
      status?: 'success' | 'error';
    }>
  > {
    const toolResults: Array<{
      toolUseId: string;
      content: Array<{ json?: Record<string, unknown>; text?: string }>;
      status?: 'success' | 'error';
    }> = [];

    // Extract tool use blocks from the message content
    const messageContent = converseOutput.output?.message?.content;
    if (!messageContent) {
      return toolResults;
    }

    for (const contentBlock of messageContent) {
      if ('toolUse' in contentBlock && contentBlock.toolUse) {
        const toolUse = contentBlock.toolUse;
        const bedrockToolUse: BedrockToolUseBlock = {
          toolUseId: toolUse.toolUseId || '',
          name: toolUse.name || '',
          input: (toolUse.input as Record<string, unknown>) || {},
        };

        const result = await this.executeToolCall(userId, bedrockToolUse, options, modifiers);
        toolResults.push(result);
      }
    }

    return toolResults;
  }
}
