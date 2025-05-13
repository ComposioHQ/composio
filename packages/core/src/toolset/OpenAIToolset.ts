/**
 * OpenAI ToolSet
 *
 * Author: Musthaq Ahamad <musthaq@composio.dev>
 * Legacy Reference: https://github.com/ComposioHQ/composio/blob/master/js/src/toolsets/openai.ts
 *
 * This is a default toolset for Composio SDK.
 * This will be shipped with the SDK and users don't need to install it separately.
 */
import { OpenAI } from 'openai';
import { Stream } from 'openai/streaming';
import { BaseNonAgenticToolset } from './BaseToolset';
import { Tool, ToolListParams } from '../types/tool.types';
import logger from '../utils/logger';
import { ExecuteToolModifiersParams, SchemaModifiersParams } from '../types/modifiers.types';

export type OpenAiTool = OpenAI.ChatCompletionTool;
export type OpenAiToolCollection = Array<OpenAiTool>;
export class OpenAIToolset extends BaseNonAgenticToolset<OpenAiToolCollection, OpenAiTool> {
  /**
   * Absract method to wrap a tool in the toolset.
   * This method is implemented by the toolset.
   * @param tool - The tool to wrap.
   * @returns The wrapped tool.
   */
  override wrapTool = (tool: Tool): OpenAiTool => {
    const formattedSchema: OpenAI.FunctionDefinition = {
      name: tool.slug,
      description: tool.description,
      parameters: tool.inputParameters,
    };
    return {
      type: 'function',
      function: formattedSchema,
    };
  };

  /**
   * Get all the tools from the Composio in OpenAI format.
   * @param params - The parameters for the tool list.
   * @param modifiers - Optional modifiers to transform tool schemas
   * @returns The tools.
   */
  async getTools(
    params?: ToolListParams,
    modifiers?: SchemaModifiersParams
  ): Promise<OpenAiToolCollection> {
    const tools = await this.getComposio()?.tools.getTools(params, modifiers?.schema);
    return tools?.map(tool => this.wrapTool(tool as Tool)) ?? [];
  }

  async getToolBySlug(slug: string, modifiers?: SchemaModifiersParams): Promise<OpenAiTool> {
    const tool = await this.getComposio().tools.getToolBySlug(slug, modifiers?.schema);
    return this.wrapTool(tool);
  }

  /**
   * Execute a tool call.
   * @param {OpenAI.ChatCompletionMessageToolCall} tool - The tool to execute.
   * @param {string} userId - The user id.
   * @returns {Promise<string>} The result of the tool call.
   */
  async executeToolCall(
    tool: OpenAI.ChatCompletionMessageToolCall,
    userId?: string,
    modifiers?: ExecuteToolModifiersParams
  ): Promise<string> {
    const toolSchema = await this.getComposio().tools.getToolBySlug(tool.function.name);
    const appSlug = toolSchema?.toolkit?.slug.toLowerCase();
    if (!appSlug) {
      throw new Error('App slug not found');
    }
    const connectedAccountId = this.getComposio().getConnectedAccountId(appSlug);
    const payload = {
      entity_id: userId ?? this.getComposio().userId,
      connected_account_id: connectedAccountId,
      arguments: JSON.parse(tool.function.arguments),
    };
    const results = await this.getComposio().tools.execute(toolSchema.slug, payload, modifiers);
    return JSON.stringify(results);
  }

  /**
   * Handle the tool call from the assistant.
   *
   * @param {OpenAI.ChatCompletion} chatCompletion - The chat completion object.
   * @param {string} userId - The user id.
   * @returns {Promise<string[]>} The results of the tool call.
   */
  async handleToolCall(
    chatCompletion: OpenAI.ChatCompletion,
    userId?: string,
    modifiers?: ExecuteToolModifiersParams
  ) {
    const outputs: string[] = [];
    for (const message of chatCompletion.choices) {
      if (message.message.tool_calls) {
        outputs.push(await this.executeToolCall(message.message.tool_calls[0], userId, modifiers));
      }
    }
    return outputs;
  }

  /**
   * Handles all the tool calls from the assistant.
   *
   * @param {OpenAI.Beta.Threads.Run} run - The run object.
   * @param {string} userId - The user id.
   * @returns {Promise<OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput[]>} The tool outputs.
   */
  async handleAssistantMessage(
    run: OpenAI.Beta.Threads.Run,
    userId?: string,
    modifiers?: ExecuteToolModifiersParams
  ) {
    const tool_calls = run.required_action?.submit_tool_outputs?.tool_calls || [];
    const tool_outputs: Array<OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput> =
      await Promise.all(
        tool_calls.map(async tool_call => {
          logger.debug(`Executing tool call: ${tool_call.id}`);

          // Execute each tool call and get the response
          const tool_response = await this.executeToolCall(
            tool_call as OpenAI.ChatCompletionMessageToolCall,
            userId,
            modifiers
          );

          logger.debug(`Tool call ${tool_call.id} executed with response: ${tool_response}`);

          return {
            tool_call_id: tool_call.id,
            output: JSON.stringify(tool_response),
          };
        })
      );
    return tool_outputs;
  }

  /**
   * Waits for the assistant stream and handles the tool calls.
   *
   * @param {OpenAI} client - The OpenAI client.
   * @param {Stream<OpenAI.Beta.Assistants.AssistantStreamEvent>} runStream - The run stream.
   * @param {OpenAI.Beta.Threads.Thread} thread - The thread object.
   * @param {string} userId - The user id.
   * @returns {AsyncGenerator<OpenAI.Beta.Assistants.AssistantStreamEvent, void, unknown>} The run stream.
   */
  async *waitAndHandleAssistantStreamToolCalls(
    client: OpenAI,
    runStream: Stream<OpenAI.Beta.Assistants.AssistantStreamEvent>,
    thread: OpenAI.Beta.Threads.Thread,
    userId?: string,
    modifiers?: ExecuteToolModifiersParams
  ) {
    // @TODO: Log the run stream
    const defaultUserId = this.getComposio()?.userId;
    let runId = null;

    // Start processing the runStream events
    for await (const event of runStream) {
      yield event; // Yield each event from the stream as it arrives

      if (event.event === 'thread.run.created') {
        const { id } = event.data;
        runId = id;
      }

      if (!runId) {
        continue;
      }

      // Handle the 'requires_action' event
      if (event.event === 'thread.run.requires_action') {
        const toolOutputs = await this.handleAssistantMessage(
          event.data,
          userId ?? defaultUserId,
          modifiers
        );

        // Submit the tool outputs
        await client.beta.threads.runs.submitToolOutputs(thread.id, runId, {
          tool_outputs: toolOutputs,
        });
      }

      // Break if the run status becomes inactive
      if (
        [
          'thread.run.completed',
          'thread.run.failed',
          'thread.run.cancelled',
          'thread.run.expired',
        ].includes(event.event)
      ) {
        break;
      }
    }

    if (!runId) {
      throw new Error('No run ID found');
    }

    // Handle any final actions after the stream ends
    let finalRun = await client.beta.threads.runs.retrieve(thread.id, runId);

    while (['queued', 'in_progress', 'requires_action'].includes(finalRun.status)) {
      if (finalRun.status === 'requires_action') {
        const toolOutputs = await this.handleAssistantMessage(
          finalRun,
          userId ?? defaultUserId,
          modifiers
        );

        // Submit tool outputs
        finalRun = await client.beta.threads.runs.submitToolOutputs(thread.id, runId, {
          tool_outputs: toolOutputs,
        });
      } else {
        // Update the run status
        finalRun = await client.beta.threads.runs.retrieve(thread.id, runId);
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait before rechecking
      }
    }
  }

  /**
   * Waits for the assistant tool calls and handles them.
   *
   * @param {OpenAI} client - The OpenAI client.
   * @param {OpenAI.Beta.Threads.Run} run - The run object.
   * @param {OpenAI.Beta.Threads.Thread} thread - The thread object.
   * @param {string} userId - The user id.
   * @returns {Promise<OpenAI.Beta.Threads.Run>} The run object.
   */
  async waitAndHandleAssistantToolCalls(
    client: OpenAI,
    run: OpenAI.Beta.Threads.Run,
    thread: OpenAI.Beta.Threads.Thread,
    userId?: string,
    modifiers?: ExecuteToolModifiersParams
  ) {
    const defaultUserId = this.getComposio()?.userId;
    while (['queued', 'in_progress', 'requires_action'].includes(run.status)) {
      // logger.debug(`Current run status: ${run.status}`);
      const tool_outputs = await this.handleAssistantMessage(
        run,
        userId ?? defaultUserId,
        modifiers
      );
      if (run.status === 'requires_action') {
        // logger.debug(
        //   `Submitting tool outputs for run ID: ${run.id} in thread ID: ${thread.id}`
        // );
        run = await client.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
          tool_outputs: tool_outputs,
        });
      } else {
        run = await client.beta.threads.runs.retrieve(thread.id, run.id);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    return run;
  }
}
