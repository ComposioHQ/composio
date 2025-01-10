import { FunctionTool, type JSONValue } from "llamaindex";
import { z } from "zod";
import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";
import { COMPOSIO_BASE_URL } from "../sdk/client/core/OpenAPI";
import { TELEMETRY_LOGGER } from "../sdk/utils/telemetry";
import { TELEMETRY_EVENTS } from "../sdk/utils/telemetry/events";
import { ZToolSchemaFilter } from "../types/base_toolset";
import { Optional, Sequence } from "../types/util";

type ToolSchema = {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };

export class LlamaIndexToolSet extends BaseComposioToolSet {
  /**
   * Composio toolset for LlamaIndex framework.
   *
   */
  static FRAMEWORK_NAME = "llamaindex";
  static DEFAULT_ENTITY_ID = "default";
  fileName: string = "js/src/frameworks/llamaindex.ts";

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
      entityId: config.entityId || LlamaIndexToolSet.DEFAULT_ENTITY_ID,
    });
  }

  private _wrapTool(
    schema: ToolSchema,
    entityId: Optional<string> = null
  ): FunctionTool<Record<string, unknown>, JSONValue | Promise<JSONValue>> {
    return FunctionTool.from(
      async (params: Record<string, unknown>) => {
        const result = await this.executeAction({
          action: schema.name,
          params,
          entityId: entityId || this.entityId,
        });
        return JSON.parse(JSON.stringify(result)) as JSONValue;
      },
      {
        name: schema.name,
        description: schema.description,
        parameters: {
          type: "object",
          properties: schema.parameters.properties || {},
          required: schema.parameters.required || [],
        },
      }
    );
  }

  async getTools(
    filters: z.infer<typeof ZToolSchemaFilter> = {},
    entityId: Optional<string> = null
  ): Promise<
    Sequence<
      FunctionTool<Record<string, unknown>, JSONValue | Promise<JSONValue>>
    >
  > {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getTools",
      file: this.fileName,
      params: { filters, entityId },
    });

    const tools = await this.getToolsSchema(filters, entityId);
    return tools.map((tool) => {
      const wrappedTool = this._wrapTool(tool, entityId || this.entityId);
      Object.assign(wrappedTool, {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      });
      return wrappedTool;
    });
  }
}
