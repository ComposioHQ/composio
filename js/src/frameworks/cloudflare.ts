import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";
import {
  AiTextGenerationOutput,
  AiTextGenerationToolInput,
  // @ts-ignore
} from "@cloudflare/workers-types";

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
  }) {
    super(
      config.apiKey || null,
      config.baseUrl || null,
      "cloudflare",
      config.entityId || "default"
    );
  }

  async get_actions(filters: {
    actions: Sequence<string>;
  }): Promise<Sequence<AiTextGenerationToolInput>> {
    return (
      (await this.client.actions.list({})).items
        ?.filter((a) => {
          return filters.actions.includes(a!.name!);
        })
        .map((action) => {
          const formattedSchema: AiTextGenerationToolInput["function"] = {
            name: action.name!,
            description: action.description!,
            parameters: action.parameters!,
          };
          const tool: AiTextGenerationToolInput = {
            type: "function",
            function: formattedSchema,
          };
          return tool;
        }) || []
    );
  }

  async get_tools(filters: {
    apps: Sequence<string>;
    tags: Optional<Array<string>>;
    useCase: Optional<string>;
  }): Promise<Sequence<AiTextGenerationToolInput>> {
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
          parameters: action.parameters!,
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
    tool: AiTextGenerationOutput,
    entityId: Optional<string> = null
  ): Promise<string> {
    return JSON.stringify(
      await this.execute_action(
        tool.name,
        JSON.parse(tool.arguments),
        entityId || this.entityId
      )
    );
  }

  async handle_tool_call(
    result: AiTextGenerationOutput,
    entityId: Optional<string> = null
  ): Promise<Sequence<string>> {
    const outputs = [];
    for (const tool_call of result.tool_calls) {
      if (tool_call.name) {
        outputs.push(
          await this.execute_tool_call(result.tool_calls[0], entityId)
        );
      }
    }
    return outputs;
  }
}
