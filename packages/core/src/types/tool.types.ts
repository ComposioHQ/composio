import { ToolRetrieveResponse } from "@composio/client/resources/tools";
import { z } from "zod";

export type Tool = ToolRetrieveResponse;

export interface BaseTool {
  name: string;
  description?: string;
  input_parameters?: Record<string, any>;
  output_parameters?: Record<string, any>;
}

export type ToolType<T extends BaseTool> = T;


export const ToolListParamsSchema = z.object({
  cursor: z.string().optional(),
  important: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  toolkit_slug: z.string().optional(),
});

export type ToolListParams = z.infer<typeof ToolListParamsSchema>;