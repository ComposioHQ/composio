import { ToolExecuteParams, ToolExecuteResponse, Tool } from './tool.types';

export type BeforeToolExecuteModifer = (toolExecuteParams: ToolExecuteParams) => ToolExecuteParams;
export type GlobalBeforeToolExecuteModifier = (
  toolSlug: string,
  toolExecuteParams: ToolExecuteParams
) => ToolExecuteParams;
export type AfterToolExecuteModifier = (
  toolExecuteResponse: ToolExecuteResponse
) => ToolExecuteResponse;
export type GlobalAfterToolExecuteModifier = (
  toolSlug: string,
  toolExecuteResponse: ToolExecuteResponse
) => ToolExecuteResponse;
export type TransformToolSchemaModifier = (toolSchemModifier: Tool) => Tool;
export type GlobalTransformToolSchemaModifier = (toolSlug: string, toolSchema: Tool) => Tool;

export type ModifiersParams = {
  beforeToolExecute?: GlobalBeforeToolExecuteModifier;
  afterToolExecute?: GlobalAfterToolExecuteModifier;
  schema?: GlobalTransformToolSchemaModifier;
};

export type ExecuteToolModifiersParams = {
  beforeToolExecute?: GlobalBeforeToolExecuteModifier;
  afterToolExecute?: GlobalAfterToolExecuteModifier;
};

export type SingleToolModifiersParams = {
  beforeToolExecute?: BeforeToolExecuteModifer;
  afterToolExecute?: AfterToolExecuteModifier;
  schema?: TransformToolSchemaModifier;
};
