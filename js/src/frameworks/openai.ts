import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";
import { OpenAI } from "openai";
import { ExecEnv } from "../env/factory";
import { COMPOSIO_BASE_URL } from "../sdk/client/core/OpenAPI";
import { GetListActionsResponse } from "../sdk/client";

type Optional<T> = T | null;
type Sequence<T> = Array<T>;

export class OpenAIToolSet extends BaseComposioToolSet {
    /**
     * Composio toolset for OpenAI framework.
     *
     * Example:
     * ```typescript
     * 
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
            "openai",
            config.entityId || "default",
            config.workspaceEnv || ExecEnv.HOST
        );
    }

    async getActions(
        filters: { actions?: Optional<Sequence<string>> } = {},
        entityId?: Optional<string>
    ): Promise<Sequence<OpenAI.ChatCompletionTool>> {
        const mainActions = await this.getActionsSchema(filters, entityId);
        return mainActions.map((action: NonNullable<GetListActionsResponse["items"]>[0]) => {
            const formattedSchema: OpenAI.FunctionDefinition = {
                name: action.name!,
                description: action.description!,
                parameters: action.parameters!
            };
            const tool: OpenAI.ChatCompletionTool = {
                type: "function",
                function: formattedSchema
            }
            return tool;
        }) || [];
    }

    async get_actions(filters: {
        actions?: Optional<Sequence<string>>
    } = {}, entityId?: Optional<string>): Promise<Sequence<OpenAI.ChatCompletionTool>> {
        console.warn("get_actions is deprecated, use getActions instead");
        return this.getActions(filters, entityId);
    }

    async getTools(
        filters: {
            apps: Sequence<string>;
            tags: Optional<Array<string>>;
            useCase: Optional<string>;
        },
        entityId?: Optional<string>
    ): Promise<Sequence<OpenAI.ChatCompletionTool>> {
        const mainActions = await this.getToolsSchema(filters, entityId);
        return mainActions.map((action: NonNullable<GetListActionsResponse["items"]>[0]) => {
            const formattedSchema: OpenAI.FunctionDefinition = {
                name: action.name!,
                description: action.description!,
                parameters: action.parameters!,
            };
            const tool: OpenAI.ChatCompletionTool = {
                type: "function",
                function: formattedSchema
            }
            return tool;
        }) || [];
    }

    async get_tools(filters: {
        apps: Sequence<string>;
        tags: Optional<Array<string>>;
        useCase: Optional<string>;
    }, entityId?: Optional<string>): Promise<Sequence<OpenAI.ChatCompletionTool>> {
        console.warn("get_tools is deprecated, use getTools instead");
        return this.getTools(filters, entityId);
    }

    async executeToolCall(
        tool: OpenAI.ChatCompletionMessageToolCall,
        entityId: Optional<string> = null
    ): Promise<string> {
        return JSON.stringify(await this.executeAction(
            tool.function.name,
            JSON.parse(tool.function.arguments),
            entityId || this.entityId
        ));
    }

    async execute_tool_call(
        tool: OpenAI.ChatCompletionMessageToolCall,
        entityId: Optional<string> = null
    ): Promise<string> {
        console.warn("execute_tool_call is deprecated, use executeToolCall instead");
        return this.executeToolCall(tool, entityId);
    }

    async handleToolCall(
        chatCompletion: OpenAI.ChatCompletion,
        entityId: Optional<string> = null
    ): Promise<Sequence<string>> {
        const outputs = [];
        for (const message of chatCompletion.choices) {
            if (message.message.tool_calls) {
                outputs.push(await this.executeToolCall(message.message.tool_calls[0], entityId));
            }
        }
        return outputs;
    }

    async handle_tool_call(
        chatCompletion: OpenAI.ChatCompletion,
        entityId: Optional<string> = null
    ): Promise<Sequence<string>> {
        console.warn("handle_tool_call is deprecated, use handleToolCall instead");
        return this.handleToolCall(chatCompletion, entityId);
    }

    async handleAssistantMessage(
        run: OpenAI.Beta.Threads.Run,
        entityId: Optional<string> = null
    ): Promise<Array<OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput>> {
        const tool_calls = run.required_action?.submit_tool_outputs?.tool_calls || [];
        const tool_outputs: Array<OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput> = await Promise.all(
            tool_calls.map(async (tool_call) => {
                const tool_response = await this.executeToolCall(
                    tool_call as OpenAI.ChatCompletionMessageToolCall,
                    entityId || this.entityId
                );
                return {
                    tool_call_id: tool_call.id,
                    output: JSON.stringify(tool_response),
                };
            })
        );
        return tool_outputs;
    }

    async handle_assistant_message(
        run: OpenAI.Beta.Threads.Run,
        entityId: Optional<string> = null
    ): Promise<Array<OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput>> {
        console.warn("handle_assistant_message is deprecated, use handleAssistantMessage instead");
        return this.handleAssistantMessage(run, entityId);
    }

    async waitAndHandleAssistantToolCalls(
        client: OpenAI,
        run: OpenAI.Beta.Threads.Run,
        thread: OpenAI.Beta.Threads.Thread,
        entityId: Optional<string> = null
    ): Promise<OpenAI.Beta.Threads.Run> {
        while (["queued", "in_progress", "requires_action"].includes(run.status)) {
            const tool_outputs = await this.handleAssistantMessage(run, entityId || this.entityId);
            if (run.status === "requires_action") {
                run = await client.beta.threads.runs.submitToolOutputs(
                    thread.id,
                    run.id,
                    {
                        tool_outputs: tool_outputs
                    }
                );
            } else {
                run = await client.beta.threads.runs.retrieve(thread.id, run.id);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        return run;
    }

    async wait_and_handle_assistant_tool_calls(
        client: OpenAI,
        run: OpenAI.Beta.Threads.Run,
        thread: OpenAI.Beta.Threads.Thread,
        entityId: Optional<string> = null
    ): Promise<OpenAI.Beta.Threads.Run> {
        console.warn("wait_and_handle_assistant_tool_calls is deprecated, use waitAndHandleAssistantToolCalls instead");
        return this.waitAndHandleAssistantToolCalls(client, run, thread, entityId);
    }
}
