import { Toolset } from "../types/toolset.types.";
import { Tool, BaseTool, ToolListParams } from "../types/tool.types";
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
 * // Using default BaseTool type
 * class DefaultToolset extends BaseComposioToolset {}
 * 
 * // Using a custom tool type
 * class MyToolset extends BaseComposioToolset<MyCustomTool> {}
 * 
 * // Using a third-party tool type
 * class ThirdPartyToolset extends BaseComposioToolset<ThirdPartyTool> {}
 * ```
 */
export abstract class BaseComposioToolset<TTool = BaseTool> implements Toolset<TTool> {
    protected client: Composio<TTool, this> | undefined;

    /**
     * Set the client for the toolset. This is automatically done by the Composio class.
     * @param client - The Composio client.
     */
    setClient(client: Composio<TTool, this>): void {
        this.client = client;
    }


    /**
     * Get all the tools from the client.
     * @param params - The parameters for the tool list.
     * @returns The tools.
     */
    async getTools(params?: ToolListParams): Promise<TTool[] | Record<string, TTool>> {
        const tools = await this.client?.tools.list(params);
        return tools?.items.map((tool) => this._wrapTool(tool as Tool)) ?? [];
    }

    /** 
     * Get a tool from the client.
     * @param slug - The slug of the tool.
     * @returns The tool.
     */
    async getTool(slug: string): Promise<TTool> {
        const tool = await this.client?.tools.get(slug);
        return this._wrapTool(tool as Tool);
    }

    /**
     * Wrap a tool in the toolset.
     * @param tool - The tool to wrap.
     * @returns The wrapped tool.
     */
    abstract _wrapTool(tool: Tool): TTool;

    /**
     * Ensure the client is initialized.
     * This is automatically done by the Composio class.
     */
    protected ensureClient(): void {
        if (!this.client) {
            throw new Error('Client not initialized. Make sure the toolset is properly initialized with Composio.');
        }
    }
}