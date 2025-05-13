import { BaseAgenticToolset, BaseComposioToolset } from '../toolset/BaseToolset';
import { ToolExecuteParams, ToolExecuteResponse, Tool } from './tool.types';

/**
 * Modifier for altering the tool execute params
 * Called before the tool execute call
 */
export type BeforeToolExecuteModifier = (
  toolSlug: string,
  toolExecuteParams: ToolExecuteParams
) => ToolExecuteParams;

/**
 * Modifier for altering the tool execute response
 * Called after the tool execute call
 */
export type AfterToolExecuteModifier = (
  toolSlug: string,
  toolExecuteResponse: ToolExecuteResponse
) => ToolExecuteResponse;

/**
 * Modifier for altering the tool schema
 * Called after the tool schema is retrieved
 */
export type TransformToolSchemaModifier = (toolSlug: string, toolSchema: Tool) => Tool;

/**
 * Modifiers for the toolset
 * This is used by Agentic toolsets
 */
export type ModifiersParams = {
  beforeToolExecute?: BeforeToolExecuteModifier;
  afterToolExecute?: AfterToolExecuteModifier;
  schema?: TransformToolSchemaModifier;
};

/**
 * Modifiers for the tool schema
 * This is used by Non-Agentic toolsets
 */
export type SchemaModifiersParams = {
  schema?: TransformToolSchemaModifier;
};

/**
 * Modifiers for the tool execution
 * This is used by execute call and handleToolCall of Non-Agentic toolsets
 */
export type ExecuteToolModifiersParams = {
  beforeToolExecute?: BeforeToolExecuteModifier;
  afterToolExecute?: AfterToolExecuteModifier;
};

export type ToolsetModifierType<T extends BaseComposioToolset<unknown, unknown>> =
  T extends BaseAgenticToolset<unknown, unknown> ? ModifiersParams : SchemaModifiersParams;
