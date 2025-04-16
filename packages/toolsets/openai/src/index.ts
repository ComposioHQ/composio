import { BaseComposioToolset, Composio, Toolset } from "@composio/core";
import { Tool } from "@composio/core";
import { OpenAI } from "openai";

export class OpenAIToolset extends BaseComposioToolset<OpenAI.ChatCompletionTool> {
  static readonly FRAMEWORK_NAME = "openai";
  static readonly DEFAULT_USER_ID = "default";
  private static readonly FILE_NAME = "toolsets/openai/src/index.ts";
  private client: Composio<OpenAI.ChatCompletionTool, Toolset<OpenAI.ChatCompletionTool>> | undefined;

  setClient(client: Composio<OpenAI.ChatCompletionTool, Toolset<OpenAI.ChatCompletionTool>>) {
    this.client = client;
  }

  _wrapTool = (tool: Tool): OpenAI.ChatCompletionTool => {
    const formattedSchema: OpenAI.FunctionDefinition = {
      name: tool.name!,
      description: tool.description!,
      parameters: tool.input_parameters!,
    };
    return {
      type: "function",
      function: formattedSchema,
    };
  };

  /**
   * @TODO include the connectedAccountId / app name in the tool call
   * @param tool 
   * @param userId 
   * @returns 
   */
  async executeToolCall(
    tool: OpenAI.ChatCompletionMessageToolCall,
    userId?: string 
  ): Promise<string> {

    if (!this.client) {
      throw new Error("Client not set");
    }

    const toolSchema = await this.client.tools.get(tool.function.name);
    const results = await this.client.tools.execute(toolSchema.name, {
      arguments: JSON.parse(tool.function.arguments),
      entity_id: userId,
    });

    return JSON.stringify(results);
  }

  /**
   * 
   * @param tool 
   * @returns 
   */
  handleToolCall = async (chatCompletion: OpenAI.ChatCompletion, userId?: string) => {
    const outputs: string[] = [];
    for (const message of chatCompletion.choices) {
      if (message.message.tool_calls) {
        outputs.push(
          await this.executeToolCall(message.message.tool_calls[0], userId)
        );
      }
    }
    return outputs;
  };


  handleAssistantMessage(run: OpenAI.Beta.Threads.Run, userId?: string) {
    const threadId = run.thread_id;
  }

  async *waitAndHandleAssistantStreamToolCalls() {

  }

  async waitAndHandleAssistantToolCalls() {

  }
}