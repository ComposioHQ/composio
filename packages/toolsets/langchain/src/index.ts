import { BaseComposioToolset, jsonSchemaToModel, Tool, ToolListParams } from "@composio/core";
import { DynamicStructuredTool } from "@langchain/core/tools";



export class LangchainToolset extends BaseComposioToolset<Array<DynamicStructuredTool>, DynamicStructuredTool> {
    static FRAMEWORK_NAME = "langchain";
    private DEFAULT_ENTITY_ID = "default";
    static fileName: string = "toolsets/langchain/src/index.ts";

    /**
     * Abstract method to wrap a tool in the toolset.
     * This method is implemented by the toolset.
     * @param tool - The tool to wrap.
     * @returns The wrapped tool.
     */
    _wrapTool = (tool: Tool): DynamicStructuredTool => {
        const toolName = tool.slug
        const description = tool.description;
        const appName = tool.toolkit.name?.toLowerCase();

        const func = async (...kwargs: unknown[]): Promise<unknown> => {
            const connectedAccountId = this.client?.getConnectedAccountId(appName)
            return JSON.stringify(
                await this.client?.tools.execute(toolName, {
                    arguments: kwargs[0] as Record<string, unknown>,
                    entity_id: this.DEFAULT_ENTITY_ID,
                    connected_account_id: connectedAccountId,
                })
            );
        };

        const parameters = jsonSchemaToModel(tool.input_parameters);

        // @TODO: Add escriiption an other stuff here

        return new DynamicStructuredTool({
            name: toolName,
            description,
            schema: parameters,
            func: func,
        });
    }

    /**
     * Get all the tools from the Composio in Langchain format.
     * @param params - The parameters for the tool list.
     * @returns The tools.
     */
    async getTools(params?: ToolListParams): Promise<Array<DynamicStructuredTool>> {
        const tools = await this.client?.tools.list(params);
        return tools?.items.map((tool) => this._wrapTool(tool as Tool)) ?? [];
    }
}
