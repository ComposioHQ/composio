import { Tool, ToolListParams } from './tool.types';

/**
 * Base toolset implementation, which needs to be implemented by the extended class.
 * This class is used to create a base toolset by implementing this class.
 * This class also extends InstrumentedInstance, so that the telemetry can be instrumented for the toolset.
 */
export interface Toolset<TTool, TToolCollection> {
  wrapTool: (tool: Tool) => TTool;
  getTools: (params?: ToolListParams) => Promise<TToolCollection>;
}

/**
 * This type is used to infer the wrapped tool type from the toolset.
 * It checks if the toolset has a method `_wrapTool` and infers the return type.
 */
export type WrappedTool<TToolset> = TToolset extends {
  _wrapTool: (tool: Tool) => infer TTool;
}
  ? TTool
  : never;
