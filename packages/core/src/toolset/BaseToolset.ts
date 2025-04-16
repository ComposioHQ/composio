import { Toolset } from "../types/toolset.types.";
import { Tool } from "../types/tool.types";
import { Composio } from "../composio";

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
export abstract class BaseComposioToolset<TTool> implements Toolset<TTool> {
    protected client: Composio<Toolset<TTool>> | undefined;

    setClient(client: Composio<Toolset<TTool>>): void {
        this.client = client;
    }

    abstract _wrapTool(tool: Tool): TTool;

    protected ensureClient(): void {
        if (!this.client) {
            throw new Error('Client not initialized. Make sure the toolset is properly initialized with Composio.');
        }
    }
}