import { Tool } from "./Tool.types";

/**
 * Base toolset implementation, which needs to be implemented by the extended class.
 * This class is used to create a base toolset by implementing this class.
 */
export interface Toolset<TTool extends Tool> {
  _wrapTool: (tool: Tool) => TTool;
}
