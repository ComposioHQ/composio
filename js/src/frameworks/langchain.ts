import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";
import { COMPOSIO_BASE_URL } from "../sdk/client/core/OpenAPI";
import { TELEMETRY_LOGGER } from "../sdk/utils/telemetry";
import { TELEMETRY_EVENTS } from "../sdk/utils/telemetry/events";
import { RawActionData, ZToolSchemaFilter } from "../types/base_toolset";
import type { Optional, Sequence } from "../types/util";
import { jsonSchemaToModel } from "../utils/shared";

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
      connectedAccountIds?: Record<string, string>;
      allowTracing?: boolean;
    } = {}
  ) {
    super({
      apiKey: config.apiKey || null,
      baseUrl: config.baseUrl || COMPOSIO_BASE_URL,
      runtime: config?.runtime || LangchainToolSet.FRAMEWORK_NAME,
      entityId: config.entityId || LangchainToolSet.DEFAULT_ENTITY_ID,
      connectedAccountIds: config.connectedAccountIds,
      allowTracing: config.allowTracing || false,
    });
  }

  private _wrapTool(
    schema: RawActionData,
    entityId: Optional<string> = null
  ): DynamicStructuredTool {
    const action = schema["name"];
    const description = schema["description"];
    const appName = schema["appName"]?.toLowerCase();

    const func = async (...kwargs: unknown[]): Promise<unknown> => {
      const connectedAccountId = appName && this.connectedAccountIds?.[appName];
      return JSON.stringify(
        await this.executeAction({
          action,
          params: kwargs[0] as Record<string, unknown>,
          entityId: entityId || this.entityId,
          connectedAccountId: connectedAccountId,
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

    const tools = await this.getToolsSchema(
      filters,
      entityId,
      filters.integrationId
    );
    return tools.map((tool) =>
      this._wrapTool(tool as RawActionData, entityId || this.entityId)
    );
  }
}
