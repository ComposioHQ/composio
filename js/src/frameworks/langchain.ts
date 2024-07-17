import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";
import { jsonSchemaToModel } from "../utils/shared";
import { DynamicStructuredTool } from "@langchain/core/tools";

type Optional<T> = T | null;
type Dict<T> = { [key: string]: T };
type Sequence<T> = Array<T>;

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
            entityId?: string
        }
    ) {
        super(
            config.apiKey || null,
            config.baseUrl || null,
            "langchain",
            config.entityId || "default"
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

    async get_actions(
        filters: {
            actions?: Optional<Sequence<string>>
        } = {},
        entityId?: Optional<string>
    ): Promise<Sequence<DynamicStructuredTool>> {
        const actions =  (await this.client.actions.list({
            actions: filters.actions?.join(","),
            showAll: true
        })).items?.filter((a) => {
            return filters.actions
        });
         
         return actions!.map(tool =>
            this._wrap_tool(
                tool,
                entityId || this.entityId
            )
        );
    }

    async get_tools(
        filters: {
            apps: Sequence<string>;
            tags: Optional<Array<string>>;
            useCase: Optional<string>;
        },
        entityId: Optional<string> = null
    ): Promise<Sequence<DynamicStructuredTool>> {
        const apps =  await this.client.actions.list({
            apps: filters.apps.join(","),
            tags: filters.tags?.join(","),
            showAll: true,
            filterImportantActions: !filters.tags && !filters.useCase,
            useCase: filters.useCase || undefined
         });
        return apps.items!.map(tool =>
            this._wrap_tool(
                tool,
                entityId || this.entityId
            )
        );
    }
}
