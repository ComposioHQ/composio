import { AiTextGenerationToolInput } from "@cloudflare/workers-types";
import { BaseComposioToolset, Tool, ToolListParams } from "@composio/core";

export class CloudflareToolset extends BaseComposioToolset<AiTextGenerationToolInput> {
  static FRAMEWORK_NAME = "cloudflare";
  private DEFAULT_ENTITY_ID = "default";
  static fileName: string = "toolsets/cloudflare/src/index.ts";

  /**
   * Abstract method to wrap a tool in the toolset.
   * This method is implemented by the toolset.
   * @param tool - The tool to wrap.
   * @returns The wrapped tool.
   */
  _wrapTool(tool: Tool): AiTextGenerationToolInput {
    const formattedSchema: AiTextGenerationToolInput["function"] = {
      name: tool.name!,
      description: tool.description!,
      parameters: tool.input_parameters as unknown as {
        type: "object";
        properties: {
          [key: string]: {
            type: string;
            description?: string;
          };
        };
        required: string[];
      },
    };
    const cloudflareTool: AiTextGenerationToolInput = {
      type: "function",
      function: formattedSchema,
    };
    return cloudflareTool;
  }

  /**
   * Get all the tools from the Cloudflare API.
   * @param {ToolListParams} query - The query parameters for the tools.
   * @returns {Promise<Record<string, AiTextGenerationToolInput>>} The tools from the Cloudflare API.
   */
  override async getTools(query?: ToolListParams): Promise<Record<string, AiTextGenerationToolInput>> {
    if (!this.client) {
      throw new Error("Client not set");
    }

    const tools = await this.client.tools.list(query);
    return tools.items.reduce((tools, tool) => ({
      ...tools,
      [tool.name]: this._wrapTool(tool as Tool),
    }), {});
  }


  /**
   * Execute a tool call.
   * @param tool - The tool to execute.
   * @param userId - The user id.
   * @returns The results of the tool call.
   */
  async executeToolCall(tool: { name: string; arguments: unknown }, userId?: string): Promise<string> {
    if (!this.client) {
      throw new Error("Client not set");
    }

    const toolSchema = await this.client.tools.get(tool.name);
    const args = typeof tool.arguments === "string"
      ? JSON.parse(tool.arguments)
      : tool.arguments;
    const results = await this.client?.tools.execute(toolSchema.name, {
      arguments: args,
      entity_id: this.DEFAULT_ENTITY_ID,
      connected_account_id: this.client?.getConnectedAccountId(toolSchema.name),
    });

    return JSON.stringify(results);
  }

}
