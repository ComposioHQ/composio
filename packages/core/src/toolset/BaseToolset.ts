import type { Toolset } from "../types/toolset.types";
import type { Tool, ToolListParams } from "../types/tool.types";
import type { Composio } from "../composio";

/**
 * Base toolset implementation with proper generic defaults
 * This class is used to create a different toolsets by extending this class.
 * 
 * This class provides basic functionality to get tools, pre-process and post-process tools.
 * Every toolset should extend this class and implement the `_wrapTool` method, 
 * these extended toolsets can add their own functionality/methods to the toolset.
 * 
 * eg:
 * class YourToolSet extends BaseComposioToolset<CustomToolCollection, CustomTool> {}
 */
export abstract class BaseComposioToolset<TToolCollection, TTool> implements Toolset<TTool, TToolCollection> {
    protected client: Composio<this> | undefined;
    abstract FILE_NAME: string;
    
    /**
     * Set the client for the toolset. This is automatically done by the Composio class.
     * @param client - The Composio client.
     */
    setClient(client: Composio<this>): void {
        this.client = client;
    }


    /**
     * Get all the tools from the client.
     * @param params - The parameters for the tool list.
     * @returns The tools.
     */
    abstract getTools(params?: ToolListParams): Promise<TToolCollection>;

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