import { Composio } from "../composio";
import { Tool, BaseTool } from "./tool.types";

/**
 * Base toolset implementation, which needs to be implemented by the extended class.
 * This class is used to create a base toolset by implementing this class.
 */
export interface Toolset<TTool = BaseTool> {
  _wrapTool: (tool: Tool) => TTool;
  setClient<T extends Toolset<TTool>>(client: Composio<T>): void;
}


/**
 * This type is used to infer the wrapped tool type from the toolset.
 * It checks if the toolset has a method `_wrapTool` and infers the return type.
 */
export type WrappedTool<TToolset> = TToolset extends {
  _wrapTool: (tool: Tool) => infer TTool;
} ? TTool : never;