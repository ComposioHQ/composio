import { Toolset } from "../types/toolset.types.";
import { Tool } from "../types/tool.types";

/**
 * Base toolset implementation with proper generic defaults
 * This class is used to create a different toolsets by extending this class.
 * 
 * This class provides basic functionality to get tools, pre-process and post-process tools.
 * Every toolset should extend this class and implement the `_wrapTool` method, 
 * these extended toolsets can add their own functionality/methods to the toolset.
 * 
 * eg:
 * ```ts
 * class MyToolset extends BaseComposioToolset<MyTool> {
 *  _wrapTool(tool: BaseTool): MyTool {}
 * }
 * ```
 */
export abstract class BaseComposioToolset<TTool extends Tool> implements Toolset<TTool> {
  
    /**
     * Wraps the tool to a specific type
     * This method should be implemented by the extended class to wrap the tool to a specific type.
     * @param tool The tool to wrap (This will be the tool retrieved from the API)
     * @returns The wrapped tool
     */
    abstract _wrapTool: (tool: Tool) => TTool; 

    getTools(): TTool[] {
      return [];
    }

    // pre process the tool before executing it
    preProcessTool(tool: TTool): TTool {
        return tool;
    }

    // post process the tool after executing it
    postProcessTool(tool: TTool): TTool {
        return tool;
    }
}