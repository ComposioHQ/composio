import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";
import { OpenAI } from "openai";

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
  constructor(config: {
    apiKey?: Optional<string>;
    baseUrl?: Optional<string>;
    entityId?: string;
  }) {
    super(
      config.apiKey || null,
      config.baseUrl || null,
      "openai",
      config.entityId || "default"
    );
  }

  async get_actions(filters: {
    actions: Sequence<string>;
  }): Promise<Sequence<OpenAI.ChatCompletionTool>> {
    return (
      (await this.client.actions.list({})).items
        ?.filter((a) => {
          return filters.actions.includes(a!.name!);
        })
        .map((action) => {
          const formattedSchema: OpenAI.FunctionDefinition = {
            name: action.name!,
            description: action.description!,
            parameters: action.parameters!,
          };
          const tool: OpenAI.ChatCompletionTool = {
            type: "function",
            function: formattedSchema,
          };
          return tool;
        }) || []
    );
  }

  async get_tools(filters: {
    apps: Sequence<string>;
    tags: Optional<Array<string>>;
    useCase: Optional<string>;
  }): Promise<Sequence<OpenAI.ChatCompletionTool>> {
    return (
      (
        await this.client.actions.list({
          apps: filters.apps.join(","),
          tags: filters.tags?.join(","),
          filterImportantActions: !filters.tags && !filters.useCase,
          useCase: filters.useCase || undefined,
        })
      ).items?.map((action) => {
        const formattedSchema: OpenAI.FunctionDefinition = {
          name: action.name!,
          description: action.description!,
          parameters: action.parameters!,
        };
        const tool: OpenAI.ChatCompletionTool = {
          type: "function",
          function: formattedSchema,
        };
        return tool;
      }) || []
    );
  }

  async execute_tool_call(
    tool: OpenAI.ChatCompletionMessageToolCall,
    entityId: Optional<string> = null
  ): Promise<string> {
    return JSON.stringify(
      await this.execute_action(
        tool.function.name,
        JSON.parse(tool.function.arguments),
        entityId || this.entityId
      )
    );
  }

  async handle_tool_call(
    chatCompletion: OpenAI.ChatCompletion,
    entityId: Optional<string> = null
  ): Promise<Sequence<string>> {
    const outputs = [];
    for (const message of chatCompletion.choices) {
      if (message.message.tool_calls) {
        outputs.push(
          await this.execute_tool_call(message.message.tool_calls[0], entityId)
        );
      }
    }
    return outputs;
  }

  async handle_assistant_message(
    run: OpenAI.Beta.Threads.Run,
    entityId: Optional<string> = null
  ): Promise<
    Array<OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput>
  > {
    const tool_calls =
      run.required_action?.submit_tool_outputs?.tool_calls || [];
    const tool_outputs: Array<OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput> =
      await Promise.all(
        tool_calls.map(async (tool_call) => {
          const tool_response = await this.execute_tool_call(
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

  async wait_and_handle_assistant_tool_calls(
    client: OpenAI,
    run: OpenAI.Beta.Threads.Run,
    thread: OpenAI.Beta.Threads.Thread,
    entityId: Optional<string> = null
  ): Promise<OpenAI.Beta.Threads.Run> {
    while (["queued", "in_progress", "requires_action"].includes(run.status)) {
      const tool_outputs = await this.handle_assistant_message(
        run,
        entityId || this.entityId
      );
      if (run.status === "requires_action") {
        run = await client.beta.threads.runs.submitToolOutputs(
          thread.id,
          run.id,
          {
            tool_outputs: tool_outputs,
          }
        );
      } else {
        run = await client.beta.threads.runs.retrieve(thread.id, run.id);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    return run;
  }
}
