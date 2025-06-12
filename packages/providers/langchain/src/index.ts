/**
 * Langchain Provider
 *
 * Author: Musthaq Ahamad <musthaq@composio.dev>
 * Reference: https://github.com/ComposioHQ/composio/blob/master/js/src/frameworks/langchain.ts
 *
 * This provider provides a set of tools for interacting with Langchain.
 *
 * @packageDocumentation
 * @module providers/langchain
 */
import { BaseAgenticProvider, jsonSchemaToZodSchema, Tool, ExecuteToolFn } from '@composio/core';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { BaseMcpProvider } from '@composio/core';

export class LangchainMcpProvider extends BaseMcpProvider {
  readonly name = 'langchain';
}

export type LangChainToolCollection = Array<DynamicStructuredTool>;
export class LangchainProvider extends BaseAgenticProvider<
  LangChainToolCollection,
  DynamicStructuredTool
> {
  readonly name = 'langchain';

  readonly mcp = new LangchainMcpProvider();

  /**
   * Creates a new instance of the LangchainProvider.
   * 
   * This provider enables integration with the Langchain framework,
   * allowing Composio tools to be used with Langchain agents and chains.
   * 
   * @example
   * ```typescript
   * // Initialize the Langchain provider
   * const provider = new LangchainProvider();
   * 
   * // Use with Composio
   * const composio = new Composio({
   *   apiKey: 'your-api-key',
   *   provider: new LangchainProvider()
   * });
   * 
   * // Use the provider to wrap tools for Langchain
   * const langchainTools = provider.wrapTools(composioTools, composio.tools.execute);
   * ```
   */
  constructor() {
    super();
  }

  /**
   * Wraps a Composio tool in the Langchain DynamicStructuredTool format.
   * 
   * This method transforms a Composio tool definition into a Langchain
   * DynamicStructuredTool that can be used with Langchain agents and chains.
   * 
   * @param tool - The Composio tool to wrap
   * @param executeTool - Function to execute the tool
   * @returns The wrapped tool as a Langchain DynamicStructuredTool
   * 
   * @example
   * ```typescript
   * // Wrap a single tool for use with Langchain
   * const composioTool = {
   *   slug: 'SEARCH_TOOL',
   *   description: 'Search for information',
   *   toolkit: { name: 'search_toolkit' },
   *   inputParameters: {
   *     type: 'object',
   *     properties: {
   *       query: { type: 'string' }
   *     },
   *     required: ['query']
   *   }
   * };
   * 
   * // Create a Langchain tool using the provider
   * const langchainTool = provider.wrapTool(
   *   composioTool,
   *   composio.tools.execute
   * );
   * 
   * // Use with Langchain
   * import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
   * import { ChatOpenAI } from '@langchain/openai';
   * 
   * const model = new ChatOpenAI({ temperature: 0 });
   * const agent = await createOpenAIFunctionsAgent({
   *   llm: model,
   *   tools: [langchainTool]
   * });
   * 
   * const executor = new AgentExecutor({
   *   agent,
   *   tools: [langchainTool]
   * });
   * 
   * const result = await executor.invoke({
   *   input: "Search for information about Composio"
   * });
   * ```
   */
  wrapTool(tool: Tool, executeTool: ExecuteToolFn): DynamicStructuredTool {
    const toolName = tool.slug;
    const description = tool.description;
    const appName = tool.toolkit?.name?.toLowerCase();
    if (!appName) {
      throw new Error('App name is not defined');
    }
    const func = async (...args: unknown[]): Promise<unknown> => {
      const result = await executeTool(toolName, args[0] as Record<string, unknown>);
      return JSON.stringify(result);
    };
    if (!tool.inputParameters) {
      throw new Error('Tool input parameters are not defined');
    }
    const parameters = jsonSchemaToZodSchema(tool.inputParameters);
    return new DynamicStructuredTool({
      name: toolName,
      description: description || '',
      schema: parameters,
      func: func,
    });
  }

  /**
   * Wraps a list of Composio tools in the Langchain DynamicStructuredTool format.
   * 
   * This method transforms multiple Composio tool definitions into Langchain
   * DynamicStructuredTools that can be used with Langchain agents and chains.
   * 
   * @param tools - Array of Composio tools to wrap
   * @param executeTool - Function to execute the tools
   * @returns Array of wrapped tools as Langchain DynamicStructuredTools
   * 
   * @example
   * ```typescript
   * // Wrap multiple tools for use with Langchain
   * const composioTools = [
   *   {
   *     slug: 'SEARCH_TOOL',
   *     description: 'Search for information',
   *     toolkit: { name: 'search_toolkit' },
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
   *     toolkit: { name: 'weather_toolkit' },
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
   * // Create Langchain tools using the provider
   * const langchainTools = provider.wrapTools(
   *   composioTools,
   *   composio.tools.execute
   * );
   * 
   * // Use with Langchain
   * import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
   * import { ChatOpenAI } from '@langchain/openai';
   * 
   * const model = new ChatOpenAI({ temperature: 0 });
   * const agent = await createOpenAIFunctionsAgent({
   *   llm: model,
   *   tools: langchainTools
   * });
   * 
   * const executor = new AgentExecutor({
   *   agent,
   *   tools: langchainTools
   * });
   * ```
   */
  wrapTools(tools: Tool[], executeTool: ExecuteToolFn): LangChainToolCollection {
    return tools.map(tool => this.wrapTool(tool, executeTool));
  }
}
