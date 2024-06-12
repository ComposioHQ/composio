import { Action, App, Tag } from "../sdk/enums";
import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";
import { OpenAI } from "openai";

type Optional<T> = T | null;
type Sequence<T> = Array<T>;

export class OpenaiToolSet extends BaseComposioToolSet {
    /**
     * Composio toolset for OpenAI framework.
     *
     * Example:
     * ```typescript
     * 
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
            "openai",
            entityId
        );
    }

    async get_actions(
        _actions: Sequence<Action>,
        entityId: Optional<string> = null
    ): Promise<Sequence<OpenAI.FunctionDefinition>> {
        return (await this.client.actions.list({})).items?.filter((a) => {
            return _actions.map(action => action.action).includes(a!.name!);
        }).map(action => {
            const formattedSchema: OpenAI.FunctionDefinition = {
                name: action.name!,
                description: action.description!,
                parameters: action.parameters!
            };
            return formattedSchema;
        }) || [];
    }

    async get_tools(
        _apps: Sequence<App>,
        tags: Optional<Array<string | Tag>> = null,
        entityId: Optional<string> = null
    ): Promise<Sequence<OpenAI.FunctionDefinition>> {
        return (await this.client.actions.list({appNames: _apps.map(app => app.value).join(",")})).items?.map(action => {
            const formattedSchema: OpenAI.FunctionDefinition = {
                name: action.name!,
                description: action.description!,
                parameters: action.parameters!
            };
            return formattedSchema;
        }) || [];
    }

    async execute_tool_call(
        tool: OpenAI.ChatCompletionMessageToolCall,
        entityId: Optional<string> = null
    ): Promise<string> {
        return JSON.stringify(await this.execute_action(
            Action.from_action(tool.function.name),
            JSON.parse(tool.function.arguments),
            entityId || this.entityId
        ));
    }

    async handle_tool_call(
        chatCompletion: OpenAI.ChatCompletion,
        entityId: Optional<string> = null
    ): Promise<Sequence<string>> {
        const outputs = [];
        for (const message of chatCompletion.choices) {
            if (message.message.tool_calls) {
                outputs.push(await this.execute_tool_call(message.message.tool_calls[0], entityId));
            }
        }
        return outputs;
    }

    async handle_assistant_message(
        assistantMessage: OpenAI.ChatCompletionAssistantMessageParam,
        entityId: Optional<string> = null
    ): Promise<Sequence<string>> {
        const outputs = [];
        for (const toolCall of assistantMessage.tool_calls || []) {
            if (toolCall) {
                outputs.push(await this.execute_tool_call(toolCall, entityId));
            }
        }
        return outputs;
    }


}
