import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";
import { jsonSchemaToModel } from "../utils/shared";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ExecEnv } from "../env/factory";
import { COMPOSIO_BASE_URL } from "../sdk/client/core/OpenAPI";
import type { Optional, Dict, Sequence } from "../sdk/types";
import { GetListActionsResponse } from "../sdk/client";

export class LangchainToolSet extends BaseComposioToolSet {
    /**
     * Composio toolset for Langchain framework.
     *
     * Example:
     * ```typescript
     * import * as dotenv from "dotenv";
     * import { App, ComposioToolSet } from "composio_langchain";
     * import { AgentExecutor, create_openai_functions_agent } from "langchain/agents";
     * import { ChatOpenAI } from "langchain_openai";
     * import { hub } from "langchain";
     *
     * // Load environment variables from .env
     * dotenv.config();
     *
     * // Pull relevant agent model.
     * const prompt = hub.pull("hwchase17/openai-functions-agent");
     *
     * // Initialize tools.
     * const openai_client = new ChatOpenAI({ apiKey: process.env.OPENAI_API_KEY });
     * const composio_toolset = new ComposioToolSet();
     *
     * // Get All the tools
     * const tools = composio_toolset.get_tools({ apps: [App.GITHUB] });
     *
     * // Define task
     * const task = "Star a repo composiohq/composio on GitHub";
     *
     * // Define agent
     * const agent = create_openai_functions_agent(openai_client, tools, prompt);
     * const agent_executor = new AgentExecutor({ agent, tools, verbose: true });
     *
     * // Execute using agent_executor
     * agent_executor.invoke({ input: task });
     * ```
     */
    constructor(
        config: {
            apiKey?: Optional<string>,
            baseUrl?: Optional<string>,
            entityId?: string,
            workspaceEnv: ExecEnv
        }
    ) {
        super(
            config.apiKey || null,
            config.baseUrl || COMPOSIO_BASE_URL,
            "langchain",
            config.entityId || "default",
            config.workspaceEnv || ExecEnv.HOST
        );
    }

    private _wrapTool(
        schema: Dict<any>,
        entityId: Optional<string> = null
    ): DynamicStructuredTool {
        const app = schema["appName"];
        const action = schema["name"];
        const description = schema["description"];

        const func = async (...kwargs: any[]): Promise<any> => {
            return JSON.stringify(await this.executeAction(
                action,
                kwargs[0],
                entityId || this.entityId
            ));
        };

        const parameters = jsonSchemaToModel(schema["parameters"]);
        // @TODO: Add escriiption an othjer stuff here

        return new DynamicStructuredTool({
            name: action,
            description,
            schema: parameters,
            func: func
        });
    }

    async getActions(
        filters: {
            actions?: Optional<Sequence<string>>
        } = {},
        entityId?: Optional<string>
    ): Promise<Sequence<DynamicStructuredTool>> {
        const actions = await this.getActionsSchema(filters as any, entityId);
        return actions!.map((tool: NonNullable<GetListActionsResponse["items"]>[0]) =>
            this._wrapTool(
                tool,
                entityId || this.entityId
            )
        ) as any;
    }

    /**
     * @deprecated Use getActions instead.
     */
    async get_actions(filters: {
        actions?: Optional<Sequence<string>>
    } = {}, entityId?: Optional<string>): Promise<Sequence<DynamicStructuredTool>> {
        console.warn("get_actions is deprecated, use getActions instead");
        return this.getActions(filters, entityId);
    }

    async getTools(
        filters: {
            apps: Sequence<string>;
            tags?: Optional<Array<string>>;
            useCase?: Optional<string>;
        },
        entityId: Optional<string> = null
    ): Promise<Sequence<DynamicStructuredTool>> {
        const tools = await this.getToolsSchema(filters, entityId);
        return tools.map((tool: NonNullable<GetListActionsResponse["items"]>[0]) =>
            this._wrapTool(
                tool,
                entityId || this.entityId
            )
        );
    }

    /**
     * @deprecated Use getTools instead.
     */
    async get_tools(filters: {
        apps: Sequence<string>;
        tags?: Optional<Array<string>>;
        useCase?: Optional<string>;
    }, entityId?: Optional<string>): Promise<Sequence<DynamicStructuredTool>> {
        console.warn("get_tools is deprecated, use getTools instead");
        return this.getTools(filters, entityId);
    }
}
