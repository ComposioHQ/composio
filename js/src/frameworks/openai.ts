import { OpenAI } from "openai";
import { ComposioToolSet as BaseComposioToolSet } from "../sdk/base.toolset";

import { Stream } from "openai/streaming";
import { z } from "zod";
import { COMPOSIO_BASE_URL } from "../sdk/client/core/OpenAPI";
import { TELEMETRY_LOGGER } from "../sdk/utils/telemetry";
import { TELEMETRY_EVENTS } from "../sdk/utils/telemetry/events";
import logger from "../utils/logger";

import { ZToolSchemaFilter } from "../types/base_toolset";
import { Optional, Sequence } from "../types/util";

export class OpenAIToolSet extends BaseComposioToolSet {
  static FRAMEWORK_NAME = "openai";
  static DEFAULT_ENTITY_ID = "default";
  fileName: string = "js/src/frameworks/openai.ts";

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
      apiKey?: Optional<string>;
      baseUrl?: Optional<string>;
      entityId?: string;
      connectedAccountIds?: Record<string, string>;
      allowTracing?: boolean;
    } = {}
  ) {
    super({
      apiKey: config.apiKey || null,
      baseUrl: config.baseUrl || COMPOSIO_BASE_URL,
      runtime: OpenAIToolSet.FRAMEWORK_NAME,
      entityId: config.entityId || OpenAIToolSet.DEFAULT_ENTITY_ID,
      connectedAccountIds: config.connectedAccountIds,
      allowTracing: config.allowTracing || false,
    });
  }

  async getTools(
    filters: z.infer<typeof ZToolSchemaFilter>,
    entityId?: Optional<string>
  ): Promise<Sequence<OpenAI.ChatCompletionTool>> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getTools",
      file: this.fileName,
      params: filters,
    });

    const mainActions = await this.getToolsSchema(
      filters,
      entityId,
      filters.integrationId
    );
    return (
      mainActions.map((action) => {
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

  async executeToolCall(
    tool: OpenAI.ChatCompletionMessageToolCall,
    entityId: Optional<string> = null
  ): Promise<string> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "executeToolCall",
      file: this.fileName,
      params: { tool, entityId },
    });

    const toolSchema = await this.getToolsSchema({
      actions: [tool.function.name],
    });
    const appName = toolSchema[0]?.appName?.toLowerCase();
    const connectedAccountId = appName && this.connectedAccountIds?.[appName];

    return JSON.stringify(
      await this.executeAction({
        action: tool.function.name,
        params: JSON.parse(tool.function.arguments),
        entityId: entityId || this.entityId,
        connectedAccountId: connectedAccountId,
      })
    );
  }

  async handleToolCall(
    chatCompletion: OpenAI.ChatCompletion,
    entityId: Optional<string> = null
  ): Promise<Sequence<string>> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "handleToolCall",
      file: this.fileName,
      params: { chatCompletion, entityId },
    });
    const outputs = [];
    for (const message of chatCompletion.choices) {
      if (message.message.tool_calls) {
        outputs.push(
          await this.executeToolCall(message.message.tool_calls[0], entityId)
        );
      }
    }
    return outputs;
  }

  async handleAssistantMessage(
    run: OpenAI.Beta.Threads.Run,
    entityId: Optional<string> = null
  ): Promise<
    Array<OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput>
  > {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "handleAssistantMessage",
      file: this.fileName,
      params: { run, entityId },
    });
    const tool_calls =
      run.required_action?.submit_tool_outputs?.tool_calls || [];
    const tool_outputs: Array<OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput> =
      await Promise.all(
        tool_calls.map(async (tool_call) => {
          logger.debug(
            `Executing tool call with ID: ${tool_call.function.name} and parameters: ${JSON.stringify(tool_call.function.arguments)}`
          );
          const tool_response = await this.executeToolCall(
            tool_call as OpenAI.ChatCompletionMessageToolCall,
            entityId || this.entityId
          );
          logger.debug(
            `Received tool response: ${JSON.stringify(tool_response)}`
          );
          return {
            tool_call_id: tool_call.id,
            output: JSON.stringify(tool_response),
          };
        })
      );
    return tool_outputs;
  }

  async *waitAndHandleAssistantStreamToolCalls(
    client: OpenAI,
    runStream: Stream<OpenAI.Beta.Assistants.AssistantStreamEvent>,
    thread: OpenAI.Beta.Threads.Thread,
    entityId: string | null = null
  ): AsyncGenerator<unknown, void, unknown> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "waitAndHandleAssistantStreamToolCalls",
      file: this.fileName,
      params: { client, runStream, thread, entityId },
    });

    let runId = null;

    // Start processing the runStream events
    for await (const event of runStream) {
      yield event; // Yield each event from the stream as it arrives

      if (event.event === "thread.run.created") {
        const { id } = event.data;
        runId = id;
      }

      if (!runId) {
        continue;
      }

      // Handle the 'requires_action' event
      if (event.event === "thread.run.requires_action") {
        const toolOutputs = await this.handleAssistantMessage(
          event.data,
          entityId
        );

        // Submit the tool outputs
        await client.beta.threads.runs.submitToolOutputs(thread.id, runId, {
          tool_outputs: toolOutputs,
        });
      }

      // Break if the run status becomes inactive
      if (
        [
          "thread.run.completed",
          "thread.run.failed",
          "thread.run.cancelled",
          "thread.run.expired",
        ].includes(event.event)
      ) {
        break;
      }
    }

    if (!runId) {
      throw new Error("No run ID found");
    }

    // Handle any final actions after the stream ends
    let finalRun = await client.beta.threads.runs.retrieve(thread.id, runId);

    while (
      ["queued", "in_progress", "requires_action"].includes(finalRun.status)
    ) {
      if (finalRun.status === "requires_action") {
        const toolOutputs = await this.handleAssistantMessage(
          finalRun,
          entityId
        );

        // Submit tool outputs
        finalRun = await client.beta.threads.runs.submitToolOutputs(
          thread.id,
          runId,
          {
            tool_outputs: toolOutputs,
          }
        );
      } else {
        // Update the run status
        finalRun = await client.beta.threads.runs.retrieve(thread.id, runId);
        await new Promise((resolve) => setTimeout(resolve, 500)); // Wait before rechecking
      }
    }
  }

  async waitAndHandleAssistantToolCalls(
    client: OpenAI,
    run: OpenAI.Beta.Threads.Run,
    thread: OpenAI.Beta.Threads.Thread,
    entityId: Optional<string> = null
  ): Promise<OpenAI.Beta.Threads.Run> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "waitAndHandleAssistantToolCalls",
      file: this.fileName,
      params: { client, run, thread, entityId },
    });

    while (["queued", "in_progress", "requires_action"].includes(run.status)) {
      logger.debug(`Current run status: ${run.status}`);
      const tool_outputs = await this.handleAssistantMessage(
        run,
        entityId || this.entityId
      );
      if (run.status === "requires_action") {
        logger.debug(
          `Submitting tool outputs for run ID: ${run.id} in thread ID: ${thread.id}`
        );
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
