import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";
import {
  AiTextGenerationOutput,
  AiTextGenerationToolInput,
  // @ts-ignore
} from "@cloudflare/workers-types";
import { ExecEnv } from "../env/factory";
import { COMPOSIO_BASE_URL } from "../sdk/client/core/OpenAPI";

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

  async getActions(filters: {
    actions: Sequence<string>;
  }): Promise<Sequence<AiTextGenerationToolInput>> {
    const actions = await this.getActionsSchema(filters);
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

  async get_actions(filters: {
    actions: Sequence<string>;
  }): Promise<Sequence<AiTextGenerationToolInput>> {
    console.warn("get_actions is deprecated, use getActions instead");
    return this.getActions(filters);
  }

  async getTools(filters: {
    apps: Sequence<string>;
    tags: Optional<Array<string>>;
    useCase: Optional<string>;
  }): Promise<Sequence<AiTextGenerationToolInput>> {
    const actions = await this.getToolsSchema(filters);
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
    console.warn("get_tools is deprecated, use getTools instead");
    return this.getTools(filters);
  }

  async executeToolCall(
    tool: {
      name: string;
      arguments: unknown;
    },
    entityId: Optional<string> = null
  ): Promise<string> {
    return JSON.stringify(
      await this.executeAction(
        tool.name,
        typeof tool.arguments === "string" ? JSON.parse(tool.arguments) : tool.arguments,
        entityId || this.entityId
      )
    );
  }

  async execute_tool_call(
    tool: {
      name: string;
      arguments: unknown;
    },
    entityId: Optional<string> = null
  ): Promise<string> {
    console.warn("execute_tool_call is deprecated, use executeToolCall instead");
    return this.executeToolCall(tool, entityId);
  }

  async handleToolCall(
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
          outputs.push(await this.executeToolCall(tool_call, entityId));
        }
      }
    }
    return outputs;
  }

  async handle_tool_call(
    result: AiTextGenerationOutput,
    entityId: Optional<string> = null
  ): Promise<Sequence<string>> {
    console.warn("handle_tool_call is deprecated, use handleToolCall instead");
    return this.handleToolCall(result, entityId);
  }
}
