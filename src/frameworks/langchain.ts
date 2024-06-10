import { Action, App, Tag } from "../sdk/enums";
import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";
import { jsonSchemaToModel } from "../utils/shared";
import { DynamicStructuredTool } from "@langchain/core/tools";
import z from "zod";

type Optional<T> = T | null;
type Dict<T> = { [key: string]: T };
type Sequence<T> = Array<T>;

export class ComposioToolSet extends BaseComposioToolSet {
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
     * const task = "Star a repo SamparkAI/docs on GitHub";
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
        apiKey: Optional<string> = null,
        baseUrl: Optional<string> = null,
        entityId: string = "default"
    ) {
        super(
            apiKey,
            baseUrl,
            "langchain",
            entityId
        );
    }

    private _wrap_tool(
        schema: Dict<any>,
        entityId: Optional<string> = null
    ): DynamicStructuredTool {
        const app = schema["appName"];
        const action = schema["name"];
        const description = schema["description"];

        const func = async (...kwargs: any[]): Promise<any> => {
            return JSON.stringify(await this.execute_action(
                Action.from_app_and_action(
                    app,
                    action
                ),
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

    async get_actions(
        _actions: Sequence<Action>,
        entityId: Optional<string> = null
    ): Promise<Sequence<DynamicStructuredTool>> {
        const actions =  (await this.client.actions.list({
            limit: "999999"
        })).items?.filter((a) => {
            return _actions.map(action => action.action).includes(a!.name!);
        });
         
         return actions!.map(tool =>
            this._wrap_tool(
                tool,
                entityId || this.entityId
            )
        );
    }

    async get_tools(
        _apps: Sequence<App>,
        tags: Optional<Array<string | Tag>> = null,
        entityId: Optional<string> = null
    ): Promise<Sequence<DynamicStructuredTool>> {
        const apps =  await this.client.actions.list({
            appNames: _apps.map(app => app.value).join(","),
            limit: "99999"
         });
        return apps.items!.map(tool =>
            this._wrap_tool(
                tool,
                entityId || this.entityId
            )
        );
    }
}
