/**
 * Google GenAI Provider
 *
 * This provider provides a set of tools for interacting with Google's GenAI API.
 * It supports both the Gemini Developer API and Vertex AI implementations.
 *
 * @packageDocumentation
 * @module providers/google
 */
import {
  BaseNonAgenticProvider,
  Tool,
  ToolExecuteParams,
  ExecuteToolModifiers,
  ExecuteToolFnOptions,
  McpUrlResponse,
  McpServerGetResponse,
  McpServerUrlInfo,
} from '@composio/core';
import { FunctionDeclaration, Schema } from '@google/genai';

/**
 * Interface for Google GenAI function declaration
 * Based on the FunctionDeclaration type from @google/genai
 */
export type GoogleTool = FunctionDeclaration;

/**
 * Interface for Google GenAI function call
 * Based on the FunctionCall type from @google/genai
 */
export interface GoogleGenAIFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Type for a collection of Google GenAI function declarations
 */
export type GoogleGenAIToolCollection = GoogleTool[];

/**
 * Google GenAI Provider for Composio SDK
 * Implements the BaseNonAgenticProvider to wrap Composio tools for use with Google's GenAI API
 */
export class GoogleProvider extends BaseNonAgenticProvider<
  GoogleGenAIToolCollection,
  GoogleTool,
  McpServerGetResponse,
  URL
> {
  readonly name = 'google';

  /**
   * Creates a new instance of the GoogleProvider.
   *
   * This provider enables integration with Google's GenAI API,
   * supporting both the Gemini Developer API and Vertex AI implementations.
   *
   * @example
   * ```typescript
   * // Initialize the Google provider
   * const provider = new GoogleProvider();
   *
   * // Use with Composio
   * const composio = new Composio({
   *   apiKey: 'your-api-key',
   *   provider: new GoogleProvider()
   * });
   *
   * // Use the provider to wrap tools for Google GenAI
   * const googleTools = provider.wrapTools(composioTools);
   * ```
   */
  constructor() {
    super();
  }

  /**
   * Transform MCP URL response into Anthropic-specific format.
   * By default, Anthropic uses the standard format (same as default),
   * but this method is here to show providers can customize if needed.
   *
   * @param data - The MCP URL response data
   * @returns Standard MCP server response format
   */
  wrapMcpServerResponse(data: McpUrlResponse): McpServerGetResponse {
    // Anthropic uses the standard format
    return data.map(item => ({
      url: new URL(item.url),
      name: item.name,
    })) as McpServerGetResponse;
  }

  override wrapMcpServers(servers: McpServerGetResponse): URL {
    function wrapMcpServer(server: McpServerUrlInfo) {
      return server.url;
    }

    if (Array.isArray(servers)) {
      if (servers.length === 0) {
        throw new Error('No servers found');
      }

      return wrapMcpServer(servers[0]);
    }

    return wrapMcpServer(servers);
  }

  /**
   * Wraps a Composio tool in the Google GenAI function declaration format.
   *
   * This method transforms a Composio tool definition into the format
   * expected by Google's GenAI API for function calling.
   *
   * @param tool - The Composio tool to wrap
   * @returns The wrapped tool in Google GenAI format
   *
   * @example
   * ```typescript
   * // Wrap a single tool for use with Google GenAI
   * const composioTool = {
   *   slug: 'SEARCH_TOOL',
   *   description: 'Search for information',
   *   inputParameters: {
   *     type: 'object',
   *     properties: {
   *       query: { type: 'string' }
   *     },
   *     required: ['query']
   *   }
   * };
   *
   * const googleTool = provider.wrapTool(composioTool);
   * // Use with Google GenAI SDK
   * const genAI = new GoogleGenerativeAI('YOUR_API_KEY');
   * const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
   *
   * const result = await model.generateContent({
   *   contents: [{ role: 'user', parts: [{ text: 'Search for Composio' }] }],
   *   tools: [googleTool]
   * });
   * ```
   */
  wrapTool(tool: Tool): GoogleTool {
    return {
      name: tool.slug,
      description: tool.description || '',
      parameters: {
        type: 'object',
        description: tool.description || '',
        properties: tool.inputParameters?.properties || {},
        required: tool.inputParameters?.required || [],
      } as unknown as Schema,
    };
  }

  /**
   * Wraps a list of Composio tools in the Google GenAI function declaration format.
   *
   * This method transforms multiple Composio tool definitions into the format
   * expected by Google's GenAI API for function calling.
   *
   * @param tools - Array of Composio tools to wrap
   * @returns Array of wrapped tools in Google GenAI format
   *
   * @example
   * ```typescript
   * // Wrap multiple tools for use with Google GenAI
   * const composioTools = [
   *   {
   *     slug: 'SEARCH_TOOL',
   *     description: 'Search for information',
   *     inputParameters: {
   *       type: 'object',
   *       properties: {
   *         query: { type: 'string' }
   *       },
   *       required: ['query']
   *     }
   *   },
   *   {
   *     slug: 'WEATHER_TOOL',
   *     description: 'Get weather information',
   *     inputParameters: {
   *       type: 'object',
   *       properties: {
   *         location: { type: 'string' }
   *       },
   *       required: ['location']
   *     }
   *   }
   * ];
   *
   * const googleTools = provider.wrapTools(composioTools);
   *
   * // Use with Google GenAI SDK
   * const genAI = new GoogleGenerativeAI('YOUR_API_KEY');
   * const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
   *
   * const result = await model.generateContent({
   *   contents: [{ role: 'user', parts: [{ text: 'How is the weather in New York?' }] }],
   *   tools: googleTools
   * });
   * ```
   */
  wrapTools(tools: Tool[]): GoogleGenAIToolCollection {
    return tools.map(tool => this.wrapTool(tool));
  }

  /**
   * Executes a tool call from Google GenAI.
   *
   * This method processes a function call from Google's GenAI API,
   * executes the corresponding Composio tool, and returns the result.
   *
   * @param userId - The user ID for authentication and tracking
   * @param tool - The Google GenAI function call to execute
   * @param options - Optional execution options like connected account ID
   * @param modifiers - Optional execution modifiers for tool behavior
   * @returns The result of the tool execution as a JSON string
   *
   * @example
   * ```typescript
   * // Execute a tool call from Google GenAI
   * const functionCall = {
   *   name: 'SEARCH_TOOL',
   *   args: {
   *     query: 'composio documentation'
   *   }
   * };
   *
   * const result = await provider.executeToolCall(
   *   'user123',
   *   functionCall,
   *   { connectedAccountId: 'conn_xyz456' }
   * );
   *
   * // Parse the result and use it in your application
   * const searchResults = JSON.parse(result);
   * console.log(searchResults);
   *
   * // You can also use the result to continue the conversation
   * const genAI = new GoogleGenerativeAI('YOUR_API_KEY');
   * const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
   *
   * await model.generateContent({
   *   contents: [
   *     { role: 'user', parts: [{ text: 'Search for Composio' }] },
   *     { role: 'model', parts: [{ functionResponse: { name: 'SEARCH_TOOL', response: result } }] }
   *   ]
   * });
   * ```
   */
  async executeToolCall(
    userId: string,
    tool: GoogleGenAIFunctionCall,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<string> {
    const payload: ToolExecuteParams = {
      arguments: tool.args,
      connectedAccountId: options?.connectedAccountId,
      customAuthParams: options?.customAuthParams,
      customConnectionData: options?.customConnectionData,
      userId: userId,
    };

    const result = await this.executeTool(tool.name, payload, modifiers);
    return JSON.stringify(result);
  }
}
