import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";
import {
  AiTextGenerationOutput,
  AiTextGenerationToolInput,
  // @ts-ignore
} from "@cloudflare/workers-types";
import { GetListActionsResponse } from "../sdk/client";
import { ExecEnv } from "../env/factory";
import { COMPOSIO_BASE_URL } from "../sdk/client/core/OpenAPI";
import { LocalActions } from "../utils/localTools";
import { ComposioServer } from "../sdk/models/composioServer";

type Optional<T> = T | null;
type Sequence<T> = Array<T>;

export class CloudflareToolSet extends BaseComposioToolSet {
  /**
   * Composio toolset for Cloudflare framework.
   *
   * Example:
   * ```typescript
   *
   * ```
   */
  constructor(config: {
    apiKey?: Optional<string>;
    baseUrl?: Optional<string>;
    entityId?: string;
    workspaceEnv: ExecEnv;
  }) {
    super(
      config.apiKey || null,
      config.baseUrl || COMPOSIO_BASE_URL,
      "cloudflare",
      config.entityId || "default",
      config.workspaceEnv || ExecEnv.HOST
    );
  }

  async get_actions(filters: {
    actions: Sequence<string>;
  }): Promise<Sequence<AiTextGenerationToolInput>> {
    await this.setup();

    let actions =  (await this.client.actions.list({
      actions: filters.actions?.join(","),
      showAll: true
    })).items?.filter((a) => {
        return filters.actions
    });

    const localActionsArr = [];
    for (const action of filters.actions!) {
        if (LocalActions.includes(action.toLowerCase())) {
            const actionData = await ComposioServer.getAction(action);
            if(actionData) {
                localActionsArr.push(actionData);
            }
        }
    }
    actions = [...actions!, ...localActionsArr];
    return actions.map((action) => {
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

  async get_tools(filters: {
    apps: Sequence<string>;
    tags: Optional<Array<string>>;
    useCase: Optional<string>;
  }): Promise<Sequence<AiTextGenerationToolInput>> {
    await this.setup();

    return (
      (
        await this.client.actions.list({
          apps: filters.apps.join(","),
          tags: filters.tags?.join(","),
          filterImportantActions: !filters.tags && !filters.useCase,
          useCase: filters.useCase || undefined,
        })
      ).items?.map((action) => {
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

  async execute_tool_call(
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

  async handle_tool_call(
    result: AiTextGenerationOutput,
    entityId: Optional<string> = null
  ): Promise<Sequence<string>> {
    const outputs = [];
    if (result instanceof ReadableStream) {
      console.log("");
    } else if (!result) {
      console.log("");
    } else if ("tool_calls" in result && Array.isArray(result.tool_calls)) {
      for (const tool_call of result.tool_calls) {
        if (tool_call.name) {
          outputs.push(await this.execute_tool_call(tool_call, entityId));
        }
      }
    }
    return outputs;
  }
}
