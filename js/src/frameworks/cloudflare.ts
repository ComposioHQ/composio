// Import core dependencies
import {
  AiTextGenerationOutput,
  AiTextGenerationToolInput,
} from "@cloudflare/workers-types";
import { z } from "zod";
import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";
import { COMPOSIO_BASE_URL } from "../sdk/client/core/OpenAPI";
import { TELEMETRY_LOGGER } from "../sdk/utils/telemetry";
import { TELEMETRY_EVENTS } from "../sdk/utils/telemetry/events";
import { ZToolSchemaFilter } from "../types/base_toolset";
import { Optional, Sequence } from "../types/util";

/**
 * CloudflareToolSet provides integration with Cloudflare Workers AI
 * for executing AI tool calls and handling responses
 */
export class CloudflareToolSet extends BaseComposioToolSet {
  // Class constants
  static FRAMEWORK_NAME = "cloudflare";
  static DEFAULT_ENTITY_ID = "default";
  fileName: string = "js/src/frameworks/cloudflare.ts";

  /**
   * Initialize a new CloudflareToolSet instance
   *
   * @param config Configuration options including API key, base URL, entity ID and workspace config
   */
  constructor(
    config: {
      apiKey?: Optional<string>;
      baseUrl?: Optional<string>;
      entityId?: string;
      connectedAccountIds?: Record<string, string>;
      allowTracing?: boolean;
    } = {}
  ) {
    super({
      apiKey: config.apiKey || null,
      baseUrl: config.baseUrl || COMPOSIO_BASE_URL,
      runtime: null,
      entityId: config.entityId || CloudflareToolSet.DEFAULT_ENTITY_ID,
      connectedAccountIds: config.connectedAccountIds,
      allowTracing: config.allowTracing || false,
    });
  }

  /**
   * Retrieve available tools based on provided filters
   *
   * @param filters Optional filters for actions, apps, tags and use cases
   * @returns Promise resolving to array of AI text generation tools
   */
  async getTools(
    filters: z.infer<typeof ZToolSchemaFilter>
  ): Promise<Sequence<AiTextGenerationToolInput>> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getTools",
      file: this.fileName,
      params: filters,
    });
    const actions = await this.getToolsSchema(filters);
    return (
      actions.map((action) => {
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
      }) || []
    );
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
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "executeToolCall",
      file: this.fileName,
      params: { tool, entityId },
    });

    const toolSchema = await this.getToolsSchema({
      actions: [tool.name],
    });
    const appName = toolSchema[0]?.appName?.toLowerCase();
    const connectedAccountId = appName && this.connectedAccountIds?.[appName];

    return JSON.stringify(
      await this.executeAction({
        action: tool.name,
        params:
          typeof tool.arguments === "string"
            ? JSON.parse(tool.arguments)
            : tool.arguments,
        entityId: entityId || this.entityId,
        connectedAccountId: connectedAccountId,
      })
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
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "handleToolCall",
      file: this.fileName,
      params: { result, entityId },
    });
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
