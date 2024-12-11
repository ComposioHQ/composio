import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";
import { jsonSchemaToModel } from "../utils/shared";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { COMPOSIO_BASE_URL } from "../sdk/client/core/OpenAPI";
import type { Optional, Dict, Sequence } from "../sdk/types";
import { WorkspaceConfig } from "../env/config";
import { Workspace } from "../env";
import { TELEMETRY_EVENTS } from "../sdk/utils/telemetry/events";
import { TELEMETRY_LOGGER } from "../sdk/utils/telemetry";

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
      workspaceConfig?: WorkspaceConfig;
      runtime?: string;
    } = {}
  ) {
    super(
      config.apiKey || null,
      config.baseUrl || COMPOSIO_BASE_URL,
      config?.runtime || LangchainToolSet.FRAMEWORK_NAME,
      config.entityId || LangchainToolSet.DEFAULT_ENTITY_ID,
      config.workspaceConfig || Workspace.Host()
    );
  }

  private _wrapTool(
    schema: Dict<any>,
    entityId: Optional<string> = null
  ): DynamicStructuredTool {
    const action = schema["name"];
    const description = schema["description"];

    const func = async (...kwargs: any[]): Promise<any> => {
      return JSON.stringify(
        await this.executeAction({
          action,
          params: kwargs[0],
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
    filters: {
      actions?: Optional<Array<string>>;
      apps?: Sequence<string>;
      tags?: Optional<Array<string>>;
      useCase?: Optional<string>;
      usecaseLimit?: Optional<number>;
      filterByAvailableApps?: Optional<boolean>;
    },
    entityId: Optional<string> = null
  ): Promise<Sequence<DynamicStructuredTool>> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getTools",
      file: this.fileName,
      params: { filters, entityId },
    });

    const tools = await this.getToolsSchema(filters, entityId);
    return tools.map((tool) => this._wrapTool(tool, entityId || this.entityId));
  }
}
