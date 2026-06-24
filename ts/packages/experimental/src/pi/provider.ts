import {
  BaseAgenticProvider,
  type ExecuteToolFn,
  type McpServerGetResponse,
  type McpUrlResponse,
  normalizeToolArguments,
  type Tool as ComposioTool,
  type ToolExecuteResponse,
} from '@composio/core';
import { defineTool } from '@earendil-works/pi-coding-agent';
import type { Static } from 'typebox';

import { defaultFormatResult, toPiErrorResult, toPiResult } from './results';
import { objectInputSchema } from './schemas';
import { createPiSessionTools } from './session-tools';
import type {
  PiComposioSessionLike,
  PiProviderOptions,
  PiSessionToolCapabilities,
  PiSessionToolOptions,
  PiTool,
  PiToolCollection,
} from './types';

/**
 * Provider for integrating Composio tools with Pi SDK custom tools.
 */
export class PiProvider extends BaseAgenticProvider<
  PiToolCollection,
  PiTool,
  McpServerGetResponse
> {
  readonly name = 'pi';

  constructor(private readonly options: PiProviderOptions = {}) {
    super();
  }

  /**
   * Wrap a concrete Composio tool as a Pi custom tool definition.
   */
  wrapTool(composioTool: ComposioTool, executeTool: ExecuteToolFn): PiTool {
    const formatter = this.options.formatResult ?? defaultFormatResult;
    const catchErrors = this.options.catchErrors ?? true;
    const schema = objectInputSchema(composioTool.inputParameters);

    return defineTool({
      name: composioTool.slug,
      label: `${this.options.labelPrefix ?? 'Composio'}: ${composioTool.name ?? composioTool.slug}`,
      description: composioTool.description ?? `Execute ${composioTool.slug} with Composio.`,
      promptSnippet: `Use ${composioTool.slug} for ${composioTool.description ?? composioTool.name ?? 'this Composio action'}.`,
      parameters: schema,
      ...(this.options.executionMode ? { executionMode: this.options.executionMode } : {}),
      prepareArguments: args =>
        normalizeToolArguments(args, composioTool.slug) as Static<typeof schema>,
      execute: async (_toolCallId, params) => {
        try {
          const args = normalizeToolArguments(params, composioTool.slug);
          const result = await executeTool(composioTool.slug, args);
          return toPiResult(result, formatter, {
            slug: composioTool.slug,
            error: (result as ToolExecuteResponse | undefined)?.error,
          });
        } catch (error) {
          if (!catchErrors) throw error;
          return toPiErrorResult(error, formatter, { slug: composioTool.slug });
        }
      },
    });
  }

  /**
   * Wrap multiple concrete Composio tools as Pi custom tools.
   */
  wrapTools(tools: ComposioTool[], executeTool: ExecuteToolFn): PiToolCollection {
    return tools.map(tool => this.wrapTool(tool, executeTool));
  }

  createSessionTools<
    TSearchResult = unknown,
    TExecuteResult = unknown,
    TState = unknown,
    TAuthorizeResult = unknown,
    TToolkitStates = unknown,
  >(
    capabilities: PiSessionToolCapabilities<
      TSearchResult,
      TExecuteResult,
      TState,
      TAuthorizeResult,
      TToolkitStates
    >
  ): PiToolCollection;
  createSessionTools<
    TSearchResult = unknown,
    TExecuteResult = unknown,
    TToolkitStates = unknown,
    TAuthorizeResult = unknown,
  >(
    session: PiComposioSessionLike<TSearchResult, TExecuteResult, TToolkitStates, TAuthorizeResult>,
    options?: PiSessionToolOptions
  ): PiToolCollection;
  /**
   * Create Slack-bot-style dynamic Composio helpers.
   *
   * Prefer passing capabilities (`search`, `execute`, `connections`, `hooks`)
   * so app code owns auth, interception, and shared/service-session routing.
   * Passing a native Tool Router session is also supported; connection
   * management uses `session.toolkits()` + `session.authorize()` when present
   * and never executes `COMPOSIO_MANAGE_CONNECTIONS` internally.
   */
  createSessionTools(
    input: PiComposioSessionLike | PiSessionToolCapabilities,
    options: PiSessionToolOptions = {}
  ): PiToolCollection {
    return createPiSessionTools(input, this.options, options);
  }

  /**
   * Transform MCP URL responses into Pi-compatible standard URL entries.
   */
  wrapMcpServerResponse(data: McpUrlResponse): McpServerGetResponse {
    return data.map(item => ({
      url: new URL(item.url),
      name: item.name,
    })) as McpServerGetResponse;
  }
}
