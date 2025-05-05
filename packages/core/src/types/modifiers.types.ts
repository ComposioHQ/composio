import { ToolExecuteParams, ToolExecuteResponse, Tool } from "./tool.types";

export type BeforeToolExecuteModifer = (toolSlug: string, toolExecuteParams: ToolExecuteParams) => ToolExecuteParams;
export type AfterToolExecuteModifier = (toolSlug: string, toolExecuteResponse: ToolExecuteResponse) => ToolExecuteResponse;
export type TransformToolSchemaModifier = (toolSlug: string, toolSchemModifier: Tool) => Tool;