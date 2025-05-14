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
 * Non Agentic tool options. These are used by Non-Agentic toolsets
 */
export type ToolOptions = {
  /**
   * Transform tool schema modifier
   */
  modifyToolSchema?: TransformToolSchemaModifier;
};

/**
 * Modifiers for the tool execution
 * This is used by execute call and handleToolCall of Non-Agentic toolsets
 */
export type ExecuteToolModifiers = {
  /**
   * Before tool execute modifier
   */
  beforeToolExecute?: BeforeToolExecuteModifier;
  /**
   * After tool execute modifier
   */
  afterToolExecute?: AfterToolExecuteModifier;
};

/**
 * Agentic tool options. These are used by Agentic toolsets
 */
export type AgenticToolOptions = ToolOptions & ExecuteToolModifiers;

export type ToolsetOptions<T extends BaseComposioToolset<unknown, unknown>> =
  T extends BaseAgenticToolset<unknown, unknown> ? AgenticToolOptions : ToolOptions;
