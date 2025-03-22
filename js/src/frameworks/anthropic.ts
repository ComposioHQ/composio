import { Tool } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { z } from "zod";
import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";
import { COMPOSIO_BASE_URL } from "../sdk/client/core/OpenAPI";
import { TELEMETRY_LOGGER } from "../sdk/utils/telemetry";
import { TELEMETRY_EVENTS } from "../sdk/utils/telemetry/events";
import { ZToolSchemaFilter } from "../types/base_toolset";
import { Optional } from "../types/util";

export class AnthropicToolSet extends BaseComposioToolSet {
  /**
   * Composio toolset for Anthropic framework.
   *
   */
  static FRAMEWORK_NAME = "anthropic";
  static DEFAULT_ENTITY_ID = "default";
  fileName: string = "js/src/frameworks/anthropic.ts";

  constructor(
    config: {
      apiKey?: Optional<string>;
      baseUrl?: Optional<string>;
      entityId?: string;
      runtime?: string;
    } = {}
  ) {
    super({
      apiKey: config.apiKey || null,
      baseUrl: config.baseUrl || COMPOSIO_BASE_URL,
      runtime: config?.runtime || null,
      entityId: config.entityId || AnthropicToolSet.DEFAULT_ENTITY_ID,
    });
  }

  private _wrapTool(schema: {
    name: string;
    description: string;
    parameters: {
      properties: Record<string, unknown>;
      required: string[];
    };
    appName?: string;
  }): Tool {
    return {
      name: schema.name,
      description: schema.description,
      input_schema: {
        type: "object",
        properties: schema.parameters.properties || {},
        required: schema.parameters.required || [],
      },
    };
  }

  async getTools(
    filters: z.infer<typeof ZToolSchemaFilter> = {},
    entityId: Optional<string> = null
  ): Promise<Tool[]> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getTools",
      file: this.fileName,
      params: { filters, entityId },
    });

    const tools = await this.getToolsSchema(filters, entityId);
    return tools.map((tool) => this._wrapTool(tool));
  }

  async executeToolCall(
    toolCall: { name: string; arguments: string },
    entityId: Optional<string> = null
  ): Promise<string> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "executeToolCall",
      file: this.fileName,
      params: { toolCall, entityId },
    });

    const toolSchema = await this.getToolsSchema({
      actions: [toolCall.name],
    });
    const appName = toolSchema[0]?.appName?.toLowerCase();
    const connectedAccountId = appName && this.connectedAccountIds?.[appName];

    return JSON.stringify(
      await this.executeAction({
        action: toolCall.name,
        params: JSON.parse(toolCall.arguments),
        entityId: entityId || this.entityId,
        connectedAccountId: connectedAccountId,
      })
    );
  }

  async handleToolCall(
    response: {
      content?: Array<{
        type: string;
        name: string;
        id: string;
        input: Record<string, unknown>;
      }>;
    },
    entityId: Optional<string> = null
  ): Promise<string[]> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "handleToolCall",
      file: this.fileName,
      params: { response, entityId },
    });

    const outputs: string[] = [];
    if (response.content && Array.isArray(response.content)) {
      for (const content of response.content) {
        if (content.type === "tool_use") {
          outputs.push(
            await this.executeToolCall(
              {
                name: content.name,
                arguments: JSON.stringify(content.input),
              },
              entityId
            )
          );
        }
      }
    }
    return outputs;
  }
}
