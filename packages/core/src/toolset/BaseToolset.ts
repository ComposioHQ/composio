import { ExecuteToolModifiers } from '../types/modifiers.types';
import type { Tool, ToolExecuteParams, ToolExecuteResponse } from '../types/tool.types';
import { ExecuteToolFn, ExecuteToolFnOptions, GlobalExecuteToolFn } from '../types/toolset.types';

/**
 * @internal
 * Base class for all toolsets.
 * This class is not meant to be used directly, but rather to be extended by different toolset implementations.
 */
abstract class BaseToolset<TToolCollection, TTool> {
  /**
   * @public
   * The name of the toolset.
   * Used to identify the toolset in the telemetry.
   */
  abstract readonly name: string;
  /**
   * @internal
   * Whether the toolset is agentic.
   * This is set automatically set by the core SDK implementation for different toolset types.
   */
  abstract readonly _isAgentic: boolean;
  /**
   * @internal
   * The function to execute a tool.
   * This is set automatically injected by the core SDK.
   */
  private _globalExecuteToolFn!: GlobalExecuteToolFn;
  /**
   * @internal
   * Set the function to execute a tool.
   * This is set automatically injected by the core SDK.
   */
  _setExecuteToolFn(executeToolFn: GlobalExecuteToolFn): void {
    this._globalExecuteToolFn = executeToolFn;
  }

  /**
   * @public
   * Gloabl function to execute a tool.
   * This function is used by toolset providers to implement helper functions to execute tools.
   * This is a 1:1 mapping of the `execute` method in the `Tools` class.
   * @param {string} toolSlug - The slug of the tool to execute.
   * @param {Record<string, unknown>} input - The input to the tool.
   * @returns {Promise<string>} The result of the tool execution.
   */
  executeTool(
    toolSlug: string,
    body: ToolExecuteParams,
    modifers?: ExecuteToolModifiers
  ): Promise<ToolExecuteResponse> {
    return this._globalExecuteToolFn(toolSlug, body, modifers);
  }
}

/**
 * @public
 * Base class for all non-agentic toolsets.
 * This class is not meant to be used directly, but rather to be extended by concrete toolset implementations.
 */
export abstract class BaseNonAgenticToolset<TToolCollection, TTool> extends BaseToolset<
  TToolCollection,
  TTool
> {
  override readonly _isAgentic = false;

  /**
   * Wrap a tool in the provider specific format.
   * @param tool - The tool to wrap.
   * @returns The wrapped tool.
   */
  abstract wrapTool(tool: Tool): TTool;
  /**
   * Wrap a list of tools in the provider specific format.
   * @param tools - The tools to wrap.
   * @returns The wrapped tools.
   */
  abstract wrapTools(tools: Tool[]): TToolCollection;
}

/**
 * @public
 * Base class for all agentic toolsets.
 * This class is not meant to be used directly, but rather to be extended by concrete toolset implementations.
 */
export abstract class BaseAgenticToolset<TToolCollection, TTool> extends BaseToolset<
  TToolCollection,
  TTool
> {
  override readonly _isAgentic = true;

  /**
   * Wrap a tool in the provider specific format.
   * @param tool - The tool to wrap.
   * @returns The wrapped tool.
   */
  abstract wrapTool(tool: Tool, executeTool: ExecuteToolFn): TTool;
  /**
   * Wrap a list of tools in the provider specific format.
   * @param tools - The tools to wrap.
   * @returns The wrapped tools.
   */
  abstract wrapTools(tools: Tool[], executeTool: ExecuteToolFn): TToolCollection;
}

/**
 * @internal
 * Base type for all toolsets.
 * This type is used to infer the type of the toolset from the toolset implementation.
 */
export type BaseComposioToolset<TToolCollection, TTool> =
  | BaseNonAgenticToolset<TToolCollection, TTool>
  | BaseAgenticToolset<TToolCollection, TTool>;
