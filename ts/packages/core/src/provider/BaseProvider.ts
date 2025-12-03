import { ComposioGlobalExecuteToolFnNotSetError } from '../errors/ToolErrors';
import { ExecuteToolModifiers } from '../types/modifiers.types';
import type { Tool, ToolExecuteParams, ToolExecuteResponse } from '../types/tool.types';
import { ExecuteToolFn, GlobalExecuteToolFn } from '../types/provider.types';
import { McpUrlResponse, McpServerGetResponse } from '../types/mcp.types';

/**
 * @internal
 * Base class for all providers.
 * This class is not meant to be used directly, but rather to be extended by different provider implementations.
 */
abstract class BaseProvider<TMcpResponse> {
  /**
   * @public
   * The name of the provider.
   * Used to identify the provider in the telemetry.
   */
  abstract readonly name: string;
  /**
   * @internal
   * Whether the provider is agentic.
   * This is set automatically set by the core SDK implementation for different provider types.
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
   * This is set automatically and injected by the core SDK.
   */
  _setExecuteToolFn(executeToolFn: GlobalExecuteToolFn): void {
    this._globalExecuteToolFn = executeToolFn;
  }

  /**
   * @public
   * Global function to execute a tool.
   * This function is used by providers to implement helper functions to execute tools.
   * This is a 1:1 mapping of the `execute` method in the `Tools` class.
   * @param {string} toolSlug - The slug of the tool to execute.
   * @param {ToolExecuteParams} body - The body of the tool execution.
   * @param {ExecuteToolModifiers} modifers - The modifiers of the tool execution.
   * @returns {Promise<string>} The result of the tool execution.
   */
  executeTool(
    toolSlug: string,
    body: ToolExecuteParams,
    modifers?: ExecuteToolModifiers
  ): Promise<ToolExecuteResponse> {
    if (!this._globalExecuteToolFn) {
      throw new ComposioGlobalExecuteToolFnNotSetError('executeToolFn is not set');
    }

    // For provider controlled execution, always skip version check.
    return this._globalExecuteToolFn(toolSlug, body, modifers);
  }

  /**
   * @public
   * @deprecated: Will be removed in a future version, once the `experimental.mcp` flag is stabilized. Use `wrapMcpServers` instead.
   * Optional method to transform MCP URL response into provider-specific format.
   * Providers can override this method to define custom transformation logic
   * for MCP server responses.
   *
   * @param data - The MCP URL response data

   * @returns Transformed response in provider-specific format, or undefined to use default transformation
   */
  wrapMcpServerResponse?(data: McpUrlResponse): TMcpResponse;
}

/**
 * @public
 * Base class for all non-agentic providers.
 * This class is not meant to be used directly, but rather to be extended by concrete provider implementations.
 */
export abstract class BaseNonAgenticProvider<
  TToolCollection,
  TTool,
  TMcpResponse = McpServerGetResponse,
> extends BaseProvider<TMcpResponse> {
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
 * Base class for all agentic providers.
 * This class is not meant to be used directly, but rather to be extended by concrete provider implementations.
 */
export abstract class BaseAgenticProvider<
  TToolCollection,
  TTool,
  TMcpResponse,
> extends BaseProvider<TMcpResponse> {
  override readonly _isAgentic = true;

  /**
   * Wrap a tool in the provider specific format.
   * @param tool - The tool to wrap.
   * @param executeTool - The function to execute the tool.
   * @returns The wrapped tool.
   */
  abstract wrapTool(tool: Tool, executeTool: ExecuteToolFn): TTool;
  /**
   * Wrap a list of tools in the provider specific format.
   * @param tools - The tools to wrap.
   * @param executeTool - The function to execute the tool.
   * @returns The wrapped tools.
   */
  abstract wrapTools(tools: Tool[], executeTool: ExecuteToolFn): TToolCollection;
}

/**
 * @internal
 * Base type for all providers.
 * This type is used to infer the type of the provider from the provider implementation.
 */
export type BaseComposioProvider<TToolCollection, TTool, TMcpResponse = McpServerGetResponse> =
  | BaseNonAgenticProvider<TToolCollection, TTool, TMcpResponse>
  | BaseAgenticProvider<TToolCollection, TTool, TMcpResponse>;
