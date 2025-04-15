import { Tool } from "../types/Tool.types";
import { BaseComposioToolset } from "./BaseToolset";

/**
 * This is a default toolset implementation for Composio.
 * This class is used as a default toolset for Composio, if the user does not provide a toolset.
 * 
 * This class shouldn't be used directly or to be extended.
 */
export class ComposioToolset extends BaseComposioToolset<Tool> {
  _wrapTool = (tool: Tool): Tool => {
    return tool;
  };
}
