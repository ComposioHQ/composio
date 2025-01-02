import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";
import { COMPOSIO_BASE_URL } from "../sdk/client/core/OpenAPI";
import { TELEMETRY_LOGGER } from "../sdk/utils/telemetry";
import { TELEMETRY_EVENTS } from "../sdk/utils/telemetry/events";
import { ZToolSchemaFilter } from "../types/base_toolset";
import type { Optional, Sequence } from "../types/util";
import { jsonSchemaToModel } from "../utils/shared";

type ToolSchema = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export class LangchainToolSet extends BaseComposioToolSet {
  /**
   * Composio toolset for Langchain framework.
   *
   */
  static FRAMEWORK_NAME = "langchain";
  static DEFAULT_ENTITY_ID = "default";
  fileName: string = "js/src/frameworks/langchain.ts";

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
      entityId: config.entityId || LangchainToolSet.DEFAULT_ENTITY_ID,
    });
  }

  private _wrapTool(
    schema: ToolSchema,
    entityId: Optional<string> = null
  ): DynamicStructuredTool {
    const action = schema["name"];
    const description = schema["description"];

    const func = async (...kwargs: unknown[]): Promise<unknown> => {
      return JSON.stringify(
        await this.executeAction({
          action,
          params: kwargs[0] as Record<string, unknown>,
          entityId: entityId || this.entityId,
        })
      );
    };

    const parameters = jsonSchemaToModel(schema["parameters"]);

    // @TODO: Add escriiption an other stuff here

    return new DynamicStructuredTool({
      name: action,
      description,
      schema: parameters,
      func: func,
    });
  }

  async getTools(
    filters: z.infer<typeof ZToolSchemaFilter> = {},
    entityId: Optional<string> = null
  ): Promise<Sequence<DynamicStructuredTool>> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getTools",
      file: this.fileName,
      params: { filters, entityId },
    });

    const tools = await this.getToolsSchema(filters, entityId);
    return tools.map((tool) =>
      this._wrapTool(tool as ToolSchema, entityId || this.entityId)
    );
  }
}
