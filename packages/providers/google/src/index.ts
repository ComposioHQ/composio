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
export class GoogleProvider extends BaseNonAgenticProvider<GoogleGenAIToolCollection, GoogleTool> {
  readonly name = 'google';

  /**
   * Wrap a Composio tool in the Google GenAI function declaration format.
   * @param tool - The Composio tool to wrap.
   * @returns The wrapped tool in Google GenAI format.
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
   * Wrap a list of Composio tools in the Google GenAI function declaration format.
   * @param tools - The Composio tools to wrap.
   * @returns The wrapped tools in Google GenAI format.
   */
  wrapTools(tools: Tool[]): GoogleGenAIToolCollection {
    return tools.map(tool => this.wrapTool(tool));
  }

  /**
   * Execute a tool call from Google GenAI.
   * @param userId - The user id.
   * @param tool - The Google GenAI function call to execute.
   * @param options - Optional execution options.
   * @param modifiers - Optional execution modifiers.
   * @returns The result of the tool call as a JSON string.
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
      userId: userId,
    };

    const result = await this.executeTool(tool.name, payload, modifiers);
    return JSON.stringify(result);
  }
}
