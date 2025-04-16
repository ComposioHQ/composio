import { BaseComposioToolset, jsonSchemaToModel, Tool } from "@composio/core";
import { DynamicStructuredTool } from "@langchain/core/tools";



export class LangchainToolset extends BaseComposioToolset<DynamicStructuredTool> {
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
        const action = tool.name
        const description = tool.description;
        const appName = tool.toolkit.name?.toLowerCase();

        const func = async (...kwargs: unknown[]): Promise<unknown> => {
            const connectedAccountId = this.client?.getConnectedAccountId(appName)
            return JSON.stringify(
                await this.client?.tools.execute(tool.name, {
                    arguments: kwargs[0] as Record<string, unknown>,
                    entity_id: this.DEFAULT_ENTITY_ID,
                    connected_account_id: connectedAccountId,
                })
            );
        };

        const parameters = jsonSchemaToModel(tool.input_parameters);

        // @TODO: Add escriiption an other stuff here

        return new DynamicStructuredTool({
            name: action,
            description,
            schema: parameters,
            func: func,
        });
    }
}
