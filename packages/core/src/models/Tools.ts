import ComposioSDK from "@composio/client";
import { ComposioToolset } from "../toolset/Toolset";
import { ToolRetrieveResponse } from "@composio/client/resources/tools";

export type Tool = ToolRetrieveResponse;

export class Tools<T extends Tool, TS extends ComposioToolset<T>> {
    private client: ComposioSDK;
    private toolset: TS;

    constructor(client: ComposioSDK, toolset: TS) {
        this.client = client;
        this.toolset = toolset;
    }

    async list() {
        return this.client.tools.list();
    }

    async get(toolId: string): Promise<T> {
        const tool = await this.client.tools.retrieve(toolId);
        return this.toolset.wrap(tool);
    }

    async execute(tool: string, body: { [key: string]: any }) {
        return this.client.tools.execute(tool, body);
    }

    async getToolsByEnum(toolEnum: string) {
        return this.client.tools.retrieveEnum({
            body: {
                toolEnum
            }
        });
    }
}