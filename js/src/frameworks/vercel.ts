import { CoreTool, jsonSchema, tool } from "ai";
import { z } from "zod";
import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";
import { TELEMETRY_LOGGER } from "../sdk/utils/telemetry";
import { TELEMETRY_EVENTS } from "../sdk/utils/telemetry/events";
import { RawActionData } from "../types/base_toolset";

type Optional<T> = T | null;

const ZExecuteToolCallParams = z.object({
  actions: z.array(z.string()).optional(),
  apps: z.array(z.string()).optional(),
  params: z.record(z.any()).optional(),
  entityId: z.string().optional(),
  useCase: z.string().optional(),
  usecaseLimit: z.number().optional(),
  connectedAccountId: z.string().optional(),
  tags: z.array(z.string()).optional(),

  filterByAvailableApps: z.boolean().optional().default(false),
});

export class VercelAIToolSet extends BaseComposioToolSet {
  fileName: string = "js/src/frameworks/vercel.ts";
  constructor(
    config: {
      apiKey?: Optional<string>;
      baseUrl?: Optional<string>;
      entityId?: string;
    } = {}
  ) {
    super({
      apiKey: config.apiKey || null,
      baseUrl: config.baseUrl || null,
      runtime: "vercel-ai",
      entityId: config.entityId || "default",
    });
  }

  private generateVercelTool(schema: RawActionData) {
    return tool({
      description: schema.description,
      // @ts-ignore the type are JSONSchemV7. Internally it's resolved
      parameters: jsonSchema(schema.parameters as unknown),
      execute: async (params) => {
        return await this.executeToolCall(
          {
            name: schema.name,
            arguments: JSON.stringify(params),
          },
          this.entityId
        );
      },
    });
  }

  // change this implementation
  async getTools(filters: {
    actions?: Array<string>;
    apps?: Array<string>;
    tags?: Optional<Array<string>>;
    useCase?: Optional<string>;
    usecaseLimit?: Optional<number>;
    filterByAvailableApps?: Optional<boolean>;
  }): Promise<{ [key: string]: CoreTool }> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getTools",
      file: this.fileName,
      params: filters,
    });

    const {
      apps,
      tags,
      useCase,
      usecaseLimit,
      filterByAvailableApps,
      actions,
    } = ZExecuteToolCallParams.parse(filters);

    const actionsList = await this.getToolsSchema({
      apps,
      actions,
      tags,
      useCase,
      useCaseLimit: usecaseLimit,
      filterByAvailableApps,
    });

    const tools: { [key: string]: CoreTool } = {};
    actionsList.forEach((actionSchema) => {
      tools[actionSchema.name!] = this.generateVercelTool(actionSchema);
    });

    return tools;
  }

  async executeToolCall(
    tool: { name: string; arguments: unknown },
    entityId: Optional<string> = null
  ): Promise<string> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "executeToolCall",
      file: this.fileName,
      params: { tool, entityId },
    });

    return JSON.stringify(
      await this.executeAction({
        action: tool.name,
        params:
          typeof tool.arguments === "string"
            ? JSON.parse(tool.arguments)
            : tool.arguments,
        entityId: entityId || this.entityId,
      })
    );
  }
}
