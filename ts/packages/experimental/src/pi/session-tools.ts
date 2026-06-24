import { normalizeToolArguments } from '@composio/core';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { applyAuthLinkHandlers } from './auth-links';
import {
  defaultIsToolkitConnected,
  formatDefaultConnectionResult,
  normalizeToolkitStateMap,
  toCapabilities,
} from './connections';
import { runHook } from './hooks';
import { defaultFormatResult, hookControls, toPiErrorResult, toPiResult } from './results';
import { optionalRecordSchema, ToolkitsSchema } from './schemas';
import { DEFAULT_SESSION_TOOL_NAMES } from './types';
import type {
  PiBaseToolContext,
  PiComposioSessionLike,
  PiConnectionManagementContext,
  PiConnectionToolkitResult,
  PiExecuteContext,
  PiExecuteHookContext,
  PiManageConnectionsHookContext,
  PiProviderOptions,
  PiRemoteBashHookContext,
  PiRemoteBashRequest,
  PiRemoteWorkbenchHookContext,
  PiRemoteWorkbenchRequest,
  PiSearchContext,
  PiSearchHookContext,
  PiSessionToolCapabilities,
  PiSessionToolName,
  PiSessionToolOptions,
  PiToolCollection,
  PiToolDetails,
} from './types';
import { maybeTransform, normalizeToolkits, toolkitFromToolSlug } from './utils';

// eslint-disable-next-line max-lines-per-function
export const createPiSessionTools = (
  input: PiComposioSessionLike | PiSessionToolCapabilities,
  providerOptions: PiProviderOptions,
  options: PiSessionToolOptions = {}
): PiToolCollection => {
  const capabilities = toCapabilities(input, providerOptions, options);
  const formatter = capabilities.formatResult ?? defaultFormatResult;
  const catchErrors = capabilities.catchErrors ?? true;
  const names = { ...DEFAULT_SESSION_TOOL_NAMES, ...(capabilities.names ?? {}) };
  const executionMode = capabilities.executionMode;

  const buildBaseContext = (
    toolCallId: string,
    sourceTool: (typeof DEFAULT_SESSION_TOOL_NAMES)[PiSessionToolName] | string,
    originalRequest: unknown
  ): PiBaseToolContext => ({
    toolCallId,
    sourceTool,
    sessionId: capabilities.sessionId,
    originalRequest,
  });

  const manageConnectionsForToolkits = async (
    toolCallId: string,
    originalRequest: unknown,
    toolkits: string[],
    reinitiateAll = false
  ): Promise<{
    value: unknown;
    authLinks: string[];
    context: PiConnectionManagementContext;
    denied?: boolean;
  }> => {
    const connectionContext: PiConnectionManagementContext = {
      ...buildBaseContext(toolCallId, names.manageConnections, originalRequest),
      requestedToolkits: toolkits,
      callbackUrl: capabilities.callbackUrl,
      reinitiateAll,
    };
    const hookContext: PiManageConnectionsHookContext = {
      ...hookControls,
      request: { toolkits, reinitiateAll },
      context: connectionContext,
    };
    const authLinks: string[] = [];

    const value = await runHook(capabilities.hooks?.manageConnections, hookContext, async () => {
      const requestedToolkits = normalizeToolkits(hookContext.request.toolkits) ?? [];
      const shouldReinitiateAll = hookContext.request.reinitiateAll;
      connectionContext.requestedToolkits = requestedToolkits;
      connectionContext.reinitiateAll = shouldReinitiateAll;

      const statesRaw = await capabilities.connections?.getToolkitStates?.(
        requestedToolkits,
        connectionContext
      );
      const states = normalizeToolkitStateMap(statesRaw, requestedToolkits);
      const results: Record<string, PiConnectionToolkitResult> = {};

      for (const toolkit of requestedToolkits) {
        const state = states.get(toolkit.toLowerCase());
        const connected = state
          ? (capabilities.connections?.isConnected?.(state, {
              toolkit,
              request: connectionContext,
            }) ?? defaultIsToolkitConnected(state))
          : false;

        if (connected && !shouldReinitiateAll) {
          results[toolkit] = {
            toolkit,
            connected: true,
            status: 'connected',
            state,
          };
          continue;
        }

        if (!capabilities.connections?.authorizeToolkit) {
          results[toolkit] = {
            toolkit,
            connected: false,
            status: 'missing_authorize_handler',
            state,
          };
          continue;
        }

        const authorization = await capabilities.connections.authorizeToolkit(
          toolkit,
          {
            callbackUrl: capabilities.callbackUrl,
            reinitiate: shouldReinitiateAll,
          },
          connectionContext
        );
        const handledAuthorization = await applyAuthLinkHandlers(capabilities, authorization, {
          ...connectionContext,
          toolkit,
          result: authorization,
        });
        authLinks.push(...handledAuthorization.authLinks);
        results[toolkit] = {
          toolkit,
          connected: false,
          status: 'auth_initiated',
          state,
          authorization: handledAuthorization.value,
        };
      }

      return formatDefaultConnectionResult(results);
    });

    return { value, authLinks, context: connectionContext };
  };

  const executeWithPolicy = async (
    toolCallId: string,
    sourceTool: (typeof DEFAULT_SESSION_TOOL_NAMES)[PiSessionToolName] | string,
    originalRequest: unknown,
    toolSlug: string,
    args: Record<string, unknown>,
    account?: string
  ): Promise<{
    value: unknown;
    authLinks: string[];
    context: PiExecuteContext;
    denied?: boolean;
  }> => {
    const executeContext: PiExecuteContext = {
      ...buildBaseContext(toolCallId, sourceTool, originalRequest),
      toolSlug,
      toolkit: toolkitFromToolSlug(toolSlug),
      args,
      account,
    };
    const authLinks: string[] = [];
    const hookContext: PiExecuteHookContext = {
      ...hookControls,
      request: { toolSlug, args, account },
      context: executeContext,
      manageConnections: async (managedToolkits, manageOptions) => {
        const managed = await manageConnectionsForToolkits(
          toolCallId,
          originalRequest,
          managedToolkits,
          manageOptions?.reinitiateAll
        );
        authLinks.push(...managed.authLinks);
        return managed.value;
      },
    };

    const value = await runHook(capabilities.hooks?.execute, hookContext, async () => {
      const finalToolSlug = hookContext.request.toolSlug;
      const finalArgs = hookContext.request.args;
      const finalAccount = hookContext.request.account;
      const finalContext: PiExecuteContext = {
        ...executeContext,
        toolSlug: finalToolSlug,
        toolkit: toolkitFromToolSlug(finalToolSlug),
        args: finalArgs,
        account: finalAccount,
      };
      hookContext.context = finalContext;

      const execute = hookContext.request.execute ?? capabilities.execute;
      const session = hookContext.request.session;
      const result = session
        ? await session.execute(
            finalToolSlug,
            finalArgs,
            finalAccount ? { account: finalAccount } : undefined
          )
        : await execute(
            finalToolSlug,
            finalArgs,
            finalAccount ? { account: finalAccount } : undefined,
            finalContext
          );
      const handledResult = await applyAuthLinkHandlers(capabilities, result, {
        ...finalContext,
        result,
      });
      authLinks.push(...handledResult.authLinks);
      return handledResult.value;
    });

    return { value, authLinks, context: hookContext.context };
  };

  const searchTools = defineTool({
    name: names.search,
    label: 'Composio Search Tools',
    description:
      'Search Composio for tools that can perform a requested action. Search globally by default; pass toolkits only when intentionally narrowing the search.',
    promptSnippet:
      'Use composio_search_tools to discover exact Composio tool slugs and schemas before executing app actions.',
    promptGuidelines: [
      'Search Composio before inventing tool slugs or arguments.',
      'Only pass a toolkit filter when you intentionally want to narrow search results.',
    ],
    parameters: Type.Object({
      query: Type.String({
        description: 'Natural language description of the action to perform.',
      }),
      toolkits: ToolkitsSchema,
    }),
    ...(executionMode ? { executionMode } : {}),
    execute: async (toolCallId, params) => {
      try {
        const requestedToolkits = normalizeToolkits(params.toolkits);
        const searchContext: PiSearchContext = {
          ...buildBaseContext(toolCallId, names.search, params),
          query: params.query,
          requestedToolkits,
        };
        const hookContext: PiSearchHookContext = {
          ...hookControls,
          request: {
            query: params.query,
            ...(requestedToolkits ? { toolkits: requestedToolkits } : {}),
          },
          context: searchContext,
        };
        const authLinks: string[] = [];
        const value = await runHook(capabilities.hooks?.search, hookContext, async () => {
          const toolkits = normalizeToolkits(hookContext.request.toolkits);
          hookContext.context.query = hookContext.request.query;
          hookContext.context.requestedToolkits = toolkits;
          const result = await capabilities.search(
            {
              query: hookContext.request.query,
              ...(toolkits ? { toolkits } : {}),
            },
            hookContext.context
          );
          const handledResult = await applyAuthLinkHandlers(capabilities, result, {
            ...hookContext.context,
            result,
          });
          authLinks.push(...handledResult.authLinks);
          return handledResult.value;
        });
        const transformed = await maybeTransform(capabilities, {
          tool: 'search',
          requestedToolkits: hookContext.context.requestedToolkits,
          value,
          context: hookContext.context,
        });
        return toPiResult(transformed, formatter, { slug: names.search, authLinks });
      } catch (error) {
        if (!catchErrors) throw error;
        return toPiErrorResult(error, formatter, { slug: names.search });
      }
    },
  });

  const manageConnections = defineTool({
    name: names.manageConnections,
    label: 'Composio Manage Connections',
    description:
      'Check whether the user has active connections for requested toolkits and initiate Composio auth when needed.',
    promptSnippet:
      'Use composio_manage_connections when a searched tool requires a missing app connection.',
    promptGuidelines: [
      'When an app connection is missing, call composio_manage_connections with the toolkit slug.',
      'Never ask the user for OAuth secrets or API keys directly.',
    ],
    parameters: Type.Object({
      toolkits: Type.Array(
        Type.String({ description: 'Toolkit slugs to check/connect, e.g. github, gmail.' })
      ),
      reinitiate_all: Type.Optional(
        Type.Boolean({ description: 'Force reconnection even if active connections exist.' })
      ),
    }),
    ...(executionMode ? { executionMode } : {}),
    execute: async (toolCallId, params) => {
      const toolkits = normalizeToolkits(params.toolkits) ?? [];
      try {
        const managed = await manageConnectionsForToolkits(
          toolCallId,
          params,
          toolkits,
          params.reinitiate_all ?? false
        );
        const transformed = await maybeTransform(capabilities, {
          tool: 'manageConnections',
          requestedToolkits: toolkits,
          value: managed.value,
          context: managed.context,
        });
        return toPiResult(transformed, formatter, {
          slug: names.manageConnections,
          authLinks: managed.authLinks,
          denied: managed.denied,
        });
      } catch (error) {
        if (!catchErrors) throw error;
        return toPiErrorResult(error, formatter, { slug: names.manageConnections });
      }
    },
  });

  const executeTool = defineTool({
    name: names.execute,
    label: 'Composio Execute Tool',
    description:
      'Execute an exact Composio tool slug using the configured Composio execution capability. Use search first so the slug and arguments match the schema.',
    promptSnippet:
      'Use composio_execute_tool to execute an exact Composio tool slug returned by composio_search_tools.',
    promptGuidelines: [
      'Always use exact tool slugs and schema-compliant arguments.',
      'For missing connections, use composio_manage_connections instead of asking for credentials.',
    ],
    parameters: Type.Object({
      toolSlug: Type.String({
        description: 'Exact Composio tool slug, e.g. GITHUB_CREATE_ISSUE.',
      }),
      arguments: optionalRecordSchema('Tool arguments matching the searched schema.'),
      account: Type.Optional(
        Type.String({
          description:
            'Optional account selector for multi-account sessions. Use connected account id or alias when required.',
        })
      ),
    }),
    ...(executionMode ? { executionMode } : {}),
    prepareArguments: args =>
      normalizeToolArguments(args, names.execute) as {
        toolSlug: string;
        arguments?: Record<string, unknown>;
        account?: string;
      },
    execute: async (toolCallId, params) => {
      const toolSlug = params.toolSlug.trim();
      const args = params.arguments ?? {};
      try {
        const executed = await executeWithPolicy(
          toolCallId,
          names.execute,
          params,
          toolSlug,
          args,
          params.account
        );
        const transformed = await maybeTransform(capabilities, {
          tool: 'execute',
          requestedToolkits: toolkitFromToolSlug(executed.context.toolSlug)
            ? [toolkitFromToolSlug(executed.context.toolSlug)!]
            : undefined,
          value: executed.value,
          context: executed.context,
        });
        return toPiResult(transformed, formatter, {
          slug: executed.context.toolSlug || names.execute,
          authLinks: executed.authLinks,
          denied: executed.denied,
        });
      } catch (error) {
        if (!catchErrors) throw error;
        return toPiErrorResult(error, formatter, { slug: toolSlug || names.execute });
      }
    },
  });

  if (!capabilities.includeWorkbenchTools) {
    return [searchTools, manageConnections, executeTool];
  }

  const remoteWorkbench = defineTool({
    name: names.remoteWorkbench,
    label: 'Composio Remote Workbench',
    description:
      'Execute Python code inside the Composio remote workbench for this Tool Router session. Use it for remote files, bulk processing, large tool outputs, and Composio-authenticated scripting.',
    promptSnippet:
      'Use composio_remote_workbench for Python scripting in the Composio remote sandbox when data is large, stored in remote files, or needs session-authenticated tool/proxy helpers.',
    promptGuidelines: [
      'Use composio_remote_workbench for large data processing or remote workbench files; do not use it for tiny inline transformations.',
      'Split long-running work into small cells and save checkpoints in the workbench filesystem.',
    ],
    parameters: Type.Object({
      code_to_execute: Type.String({
        description:
          'Python code to run in the persistent Composio remote workbench. Keep cells focused and avoid long-running jobs.',
      }),
      timeout: Type.Optional(
        Type.Number({
          minimum: 1,
          maximum: 780,
          description:
            'Maximum seconds to allow execution. Defaults to the session/backend workbench timeout.',
        })
      ),
      thought: Type.Optional(
        Type.String({ description: 'Concise objective for why this workbench cell is needed.' })
      ),
      file_path: Type.Optional(
        Type.String({
          description: 'Remote workbench path/glob to analyze when processing a file.',
        })
      ),
      disabled_tools: Type.Optional(
        Type.Array(Type.String({ description: 'Tool slugs to disable for this workbench call.' }))
      ),
      session_id: Type.Optional(
        Type.String({
          description:
            'Workbench workflow session id. Defaults to the Composio Tool Router session id.',
        })
      ),
    }),
    ...(executionMode ? { executionMode } : {}),
    execute: async (toolCallId, params) => {
      try {
        const request: PiRemoteWorkbenchRequest = {
          ...params,
          ...(params.session_id || capabilities.sessionId
            ? { session_id: params.session_id ?? capabilities.sessionId }
            : {}),
        };
        const hookContext: PiRemoteWorkbenchHookContext = {
          ...hookControls,
          request,
          context: {
            ...buildBaseContext(toolCallId, names.remoteWorkbench, params),
            toolSlug: 'COMPOSIO_REMOTE_WORKBENCH',
            args: request,
          },
        };
        const authLinks: string[] = [];
        const details: Pick<PiToolDetails, 'denied'> = {};
        const value = await runHook(capabilities.hooks?.remoteWorkbench, hookContext, async () => {
          const executed = await executeWithPolicy(
            toolCallId,
            names.remoteWorkbench,
            params,
            'COMPOSIO_REMOTE_WORKBENCH',
            hookContext.request
          );
          authLinks.push(...executed.authLinks);
          details.denied = executed.denied;
          hookContext.context = executed.context;
          return executed.value;
        });
        const transformed = await maybeTransform(capabilities, {
          tool: 'remoteWorkbench',
          value,
          context: hookContext.context,
        });
        return toPiResult(transformed, formatter, {
          slug: hookContext.context.toolSlug,
          authLinks,
          denied: details.denied,
        });
      } catch (error) {
        if (!catchErrors) throw error;
        return toPiErrorResult(error, formatter, { slug: 'COMPOSIO_REMOTE_WORKBENCH' });
      }
    },
  });

  const remoteBash = defineTool({
    name: names.remoteBash,
    label: 'Composio Remote Bash',
    description:
      'Execute a bash command inside the Composio remote workbench for this Tool Router session.',
    promptSnippet:
      'Use composio_remote_bash to inspect or manipulate files in the Composio remote workbench filesystem.',
    promptGuidelines: [
      'Use composio_remote_bash for filesystem inspection in the remote workbench, especially for truncated output files.',
      'Keep commands short and non-interactive.',
    ],
    parameters: Type.Object({
      command: Type.String({
        description: 'Bash command to execute in the Composio remote workbench.',
      }),
      session_id: Type.Optional(
        Type.String({
          description:
            'Workbench workflow session id. Defaults to the Composio Tool Router session id.',
        })
      ),
    }),
    ...(executionMode ? { executionMode } : {}),
    execute: async (toolCallId, params) => {
      try {
        const request: PiRemoteBashRequest = {
          ...params,
          ...(params.session_id || capabilities.sessionId
            ? { session_id: params.session_id ?? capabilities.sessionId }
            : {}),
        };
        const hookContext: PiRemoteBashHookContext = {
          ...hookControls,
          request,
          context: {
            ...buildBaseContext(toolCallId, names.remoteBash, params),
            toolSlug: 'COMPOSIO_REMOTE_BASH_TOOL',
            args: request,
          },
        };
        const authLinks: string[] = [];
        const details: Pick<PiToolDetails, 'denied'> = {};
        const value = await runHook(capabilities.hooks?.remoteBash, hookContext, async () => {
          const executed = await executeWithPolicy(
            toolCallId,
            names.remoteBash,
            params,
            'COMPOSIO_REMOTE_BASH_TOOL',
            hookContext.request
          );
          authLinks.push(...executed.authLinks);
          details.denied = executed.denied;
          hookContext.context = executed.context;
          return executed.value;
        });
        const transformed = await maybeTransform(capabilities, {
          tool: 'remoteBash',
          value,
          context: hookContext.context,
        });
        return toPiResult(transformed, formatter, {
          slug: hookContext.context.toolSlug,
          authLinks,
          denied: details.denied,
        });
      } catch (error) {
        if (!catchErrors) throw error;
        return toPiErrorResult(error, formatter, { slug: 'COMPOSIO_REMOTE_BASH_TOOL' });
      }
    },
  });

  return [searchTools, manageConnections, executeTool, remoteWorkbench, remoteBash];
};
