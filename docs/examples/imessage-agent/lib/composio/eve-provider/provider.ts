import {
  BaseAgenticProvider,
  type ExecuteToolFn,
  type McpServerGetResponse,
  type McpUrlResponse,
  normalizeToolArguments,
  removeNonRequiredProperties,
  type Tool,
  type ToolExecuteResponse,
} from "@composio/core";
import type { JsonValue } from "eve/connections";
import { type ToolDefinition, defineTool } from "eve/tools";
import { applyHooks, type EveProviderHooks } from "./hooks.js";

export type EveTool = ToolDefinition<Record<string, unknown>, ToolExecuteResponse>;
export type EveToolCollection = Record<string, EveTool>;

export interface EveProviderOptions {
  strict?: boolean;
  hooks?: EveProviderHooks;
}

export class EveProvider extends BaseAgenticProvider<
  EveToolCollection,
  EveTool,
  McpServerGetResponse
> {
  readonly name = "eve";

  constructor(private readonly options: EveProviderOptions = {}) {
    super();
  }

  wrapTool(tool: Tool, executeTool: ExecuteToolFn): EveTool {
    const params = tool.inputParameters;
    const inputSchema =
      this.options.strict && params?.type === "object"
        ? removeNonRequiredProperties(params)
        : (params ?? { type: "object", properties: {} });

    return defineTool({
      description: tool.description ?? tool.name,
      inputSchema: inputSchema as Record<string, JsonValue>,
      execute: (input) =>
        applyHooks(
          this.options.hooks ?? {},
          tool.slug,
          normalizeToolArguments(input, tool.slug),
          executeTool,
        ),
    });
  }

  wrapTools(tools: Tool[], executeTool: ExecuteToolFn): EveToolCollection {
    return Object.fromEntries(tools.map((tool) => [tool.slug, this.wrapTool(tool, executeTool)]));
  }

  wrapMcpServerResponse(data: McpUrlResponse): McpServerGetResponse {
    return data.map((item) => ({ url: new URL(item.url), name: item.name })) as McpServerGetResponse;
  }
}
