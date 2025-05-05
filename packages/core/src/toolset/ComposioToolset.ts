import { Tool, ToolListParams } from "../types/tool.types";
import { BaseComposioToolset } from "./BaseToolset";

/**
 * This is a default toolset implementation for Composio.
 * This class is used as a default toolset for Composio, if the user does not provide a toolset.
 * 
 * This class shouldn't be used directly or to be extended.
 */

interface CustomTool {
  name: string;
}
export class ComposioToolset extends BaseComposioToolset<Array<CustomTool>, CustomTool> {
  readonly FILE_NAME: string = "core/toolset/ComposioToolset.ts";
  
  _wrapTool = (tool: Tool): CustomTool => {
    return tool as CustomTool;
  };

  async getTools(params?: ToolListParams): Promise<Array<CustomTool>> {
    const tools = await this.client?.tools.getTools(params);
    return tools?.items.map((tool) => this._wrapTool(tool as Tool)) ?? [];
  }

  async test() {}
}