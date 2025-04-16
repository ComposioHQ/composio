import { ToolListResponse, ToolRetrieveResponse } from "@composio/client/resources/tools";

export type Tool = ToolRetrieveResponse;

export interface BaseTool {
  name: string;
  description?: string;
  input_parameters?: Record<string, any>;
  output_parameters?: Record<string, any>;
}

export type ToolType<T extends BaseTool> = T;