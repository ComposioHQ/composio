// Import core dependencies
import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";
import {
  AiTextGenerationOutput,
  AiTextGenerationToolInput,
} from "@cloudflare/workers-types";
import { COMPOSIO_BASE_URL } from "../sdk/client/core/OpenAPI";
import { WorkspaceConfig } from "../env/config";
import { Workspace } from "../env";
import { ActionsListResponseDTO } from "../sdk/client";

// Type definitions
type Optional<T> = T | null;
type Sequence<T> = Array<T>;

/**
 * CloudflareToolSet provides integration with Cloudflare Workers AI
 * for executing AI tool calls and handling responses
 */
export class CloudflareToolSet extends BaseComposioToolSet {
  // Class constants
  static FRAMEWORK_NAME = "cloudflare";
  static DEFAULT_ENTITY_ID = "default";

  /**
   * Initialize a new CloudflareToolSet instance
   * 
   * @param config Configuration options including API key, base URL, entity ID and workspace config
   */
  constructor(config: {
    apiKey?: Optional<string>;
    baseUrl?: Optional<string>;
    entityId?: string;
    workspaceConfig?: WorkspaceConfig
  }={}) {
    super(
      config.apiKey || null,
      config.baseUrl || COMPOSIO_BASE_URL,
      CloudflareToolSet.FRAMEWORK_NAME,
      config.entityId || CloudflareToolSet.DEFAULT_ENTITY_ID,
      config.workspaceConfig || Workspace.Host()
    );
  }

  /**
   * Retrieve available tools based on provided filters
   * 
   * @param filters Optional filters for actions, apps, tags and use cases
   * @returns Promise resolving to array of AI text generation tools
   */
  async getTools(filters: {
    actions?: Optional<Sequence<string>>;
    apps?: Sequence<string>;
    tags?: Optional<Array<string>>;
    useCase?: Optional<string>;
    usecaseLimit?: Optional<number>;
    filterByAvailableApps?: Optional<boolean>;
  }): Promise<Sequence<AiTextGenerationToolInput>> {
    const actions = await this.getToolsSchema(filters);
    return actions.map((action) => {
        // Format the action schema for Cloudflare Workers AI
        const formattedSchema: AiTextGenerationToolInput["function"] = {
          name: action.name!,
          description: action.description!,
          parameters: action.parameters as unknown as {
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
        const tool: AiTextGenerationToolInput = {
          type: "function",
          function: formattedSchema,
        };
        return tool;
      }) || [];
  }

  /**
   * Execute a single tool call
   * 
   * @param tool The tool to execute with name and arguments
   * @param entityId Optional entity ID to execute the tool for
   * @returns Promise resolving to stringified tool execution result
   */
  async executeToolCall(
    tool: {
      name: string;
      arguments: unknown;
    },
    entityId: Optional<string> = null
  ): Promise<string> {
    return JSON.stringify(
      await this.execute_action(
        tool.name,
        typeof tool.arguments === "string" ? JSON.parse(tool.arguments) : tool.arguments,
        entityId || this.entityId
      )
    );
  }

  /**
   * Handle tool calls from AI text generation output
   * 
   * @param result The AI text generation output containing tool calls
   * @param entityId Optional entity ID to execute the tools for
   * @returns Promise resolving to array of tool execution results
   */
  async handleToolCall(
    result: AiTextGenerationOutput,
    entityId: Optional<string> = null
  ): Promise<Sequence<string>> {
    const outputs = [];
    if ("tool_calls" in result && Array.isArray(result.tool_calls)) {
      for (const tool_call of result.tool_calls) {
        if (tool_call.name) {
          outputs.push(await this.executeToolCall(tool_call, entityId));
        }
      }
    }
    return outputs;
  }

}
