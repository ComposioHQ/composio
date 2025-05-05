/**
 * Langchain Toolset
 * 
 * Author: @haxzie
 * Reference: https://github.com/ComposioHQ/composio/blob/master/js/src/frameworks/langchain.ts
 * 
 * This toolset provides a set of tools for interacting with Langchain.
 * 
 * @packageDocumentation
 * @module toolsets/langchain
 */
import { BaseComposioToolset, jsonSchemaToModel } from "@composio/core";
import type { Tool, ToolListParams } from "@composio/core";
import { DynamicStructuredTool } from "@langchain/core/tools";


export type LangChainToolCollection = Array<DynamicStructuredTool>;
export class LangchainToolset extends BaseComposioToolset<LangChainToolCollection, DynamicStructuredTool> {
    static FRAMEWORK_NAME = "langchain";
    readonly FILE_NAME: string = "toolsets/langchain/src/index.ts";

    /**
     * Abstract method to wrap a tool in the toolset.
     * This method is implemented by the toolset.
     * @param tool - The tool to wrap.
     * @returns The wrapped tool.
     */
    _wrapTool(tool: Tool): DynamicStructuredTool {
        const toolName = tool.slug
        const description = tool.description;
        const appName = tool.toolkit?.name?.toLowerCase();
        if (!appName) {
            throw new Error("App name is not defined");
        }

        const func = async (...kwargs: unknown[]): Promise<unknown> => {
            const connectedAccountId = this.getComposio()?.getConnectedAccountId(appName)
            return JSON.stringify(
                await this.getComposio()?.tools.execute(toolName, {
                    arguments: kwargs[0] as Record<string, unknown>,
                    userId: this.getComposio().userId ?? this.DEFAULT_ENTITY_ID,
                    connectedAccountId: connectedAccountId,
                })
            );
        };
        if (!tool.input_parameters) {
            throw new Error("Tool input parameters are not defined");
        }
        const parameters = jsonSchemaToModel(tool.input_parameters);

        // @TODO: Add escriiption an other stuff here

        return new DynamicStructuredTool({
            name: toolName,
            description: description || "",
            schema: parameters,
            func: func,
        });
    }

    /**
     * Get all the tools from the Composio in Langchain format.
     * @param params - The parameters for the tool list.
     * @returns The tools.
     */
    async getTools(params?: ToolListParams): Promise<LangChainToolCollection> {
        const tools = await this.getComposio()?.tools.getTools(params);
        return tools?.items.map((tool) => this._wrapTool(tool as Tool)) ?? [];
    }
}
