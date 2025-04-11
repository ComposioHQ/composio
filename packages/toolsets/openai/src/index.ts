import { Tool } from "@composio/core";
import { ComposioToolset } from "@composio/core";

export interface OpenAIToolActions extends Tool {
  execute: () => Promise<any>;
}

export class OpenAIToolSet extends ComposioToolset<OpenAIToolActions> {
  constructor() {
    super();
  }

  /**
   * Handles execution of multiple tools in sequence
   * @param tools Array of tools to execute
   * @returns Promise that resolves when all tools have executed
   */
  async handleToolCall(tools: OpenAIToolActions[]): Promise<void> {
    // Using Promise.all to properly handle all async operations
    await Promise.all(
      tools.map(tool => tool.execute())
    );
  }

  /**
   * Wraps a standard Tool into an OpenAIToolActions
   * @param tool The base tool to wrap
   * @returns A tool with OpenAI-specific functionality
   */
  override wrap(tool: Tool): OpenAIToolActions {
    const openAITool: OpenAIToolActions = {
      ...tool,
      execute: async () => {
        console.log(`Executing tool: ${tool.name}`);
      },
    };

    return openAITool;
  }
}