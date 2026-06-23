/**
 * Pi Provider
 *
 * Experimental provider for @earendil-works/pi-coding-agent.
 *
 * The provider has two layers:
 * - `wrapTool` / `wrapTools` adapt concrete Composio tools into Pi custom tools.
 * - `createSessionTools` creates the Slack-bot-style dynamic Composio helpers
 *   (`composio_search_tools`, `composio_manage_connections`, `composio_execute_tool`)
 *   for a Tool Router session.
 *
 * @packageDocumentation
 * @module providers/pi
 */
import {
  BaseAgenticProvider,
  type ExecuteToolFn,
  type McpServerGetResponse,
  type McpUrlResponse,
  normalizeToolArguments,
  type Tool as ComposioTool,
  type ToolExecuteResponse,
} from '@composio/core';
import {
  defineTool,
  type AgentToolResult,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type, type Static, type TSchema } from 'typebox';

export type PiToolDetails = {
  slug?: string;
  result?: unknown;
  error?: string | null;
};

export type PiTool = ToolDefinition<TSchema, PiToolDetails>;
export type PiToolCollection = PiTool[];

export type PiToolResultFormatter = (result: unknown) => string;

export interface PiProviderOptions {
  /** Prefix shown in Pi's TUI labels. Defaults to `Composio`. */
  labelPrefix?: string;
  /** Per-tool execution mode. Defaults to Pi's runtime default. */
  executionMode?: PiTool['executionMode'];
  /** Convert Composio results to the text sent back to the model. */
  formatResult?: PiToolResultFormatter;
  /** Return thrown errors as structured JSON instead of rethrowing to Pi. Defaults to true. */
  catchErrors?: boolean;
}

export interface PiSessionToolOptions extends PiProviderOptions {
  /** Callback URL used when the manual `session.authorize()` fallback is needed. */
  callbackUrl?: string;
  /** Override the default helper tool names. */
  names?: Partial<typeof DEFAULT_SESSION_TOOL_NAMES>;
  /** Called before a result is returned to Pi; useful for redacting or routing auth links. */
  transformResult?: (params: {
    tool: keyof typeof DEFAULT_SESSION_TOOL_NAMES;
    requestedToolkits?: string[];
    value: unknown;
  }) => unknown | Promise<unknown>;
}

export interface PiComposioSessionLike {
  sessionId: string;
  search(params: { query: string; toolkits?: string[] }): Promise<unknown>;
  execute(
    toolSlug: string,
    args?: Record<string, unknown>,
    options?: { account?: string }
  ): Promise<unknown>;
  authorize?(
    toolkit: string,
    options?: { callbackUrl?: string; alias?: string; experimental?: unknown }
  ): Promise<{ redirectUrl?: string; redirect_url?: string; connectedAccountId?: string; id?: string }>;
}

const DEFAULT_SESSION_TOOL_NAMES = {
  search: 'composio_search_tools',
  manageConnections: 'composio_manage_connections',
  execute: 'composio_execute_tool',
} as const;

const defaultFormatResult: PiToolResultFormatter = result => JSON.stringify(result, null, 2);

const EmptyObjectSchema = Type.Object({});

const ToolkitsSchema = Type.Optional(
  Type.Array(Type.String({ description: 'Optional toolkit slug filter, e.g. github, gmail.' }))
);

const normalizeToolkits = (value: unknown): string[] | undefined => {
  const toolkits = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : typeof value === 'string' && value.trim().length > 0
      ? [value]
      : [];
  const unique = [...new Set(toolkits.map(toolkit => toolkit.trim()))];
  return unique.length > 0 ? unique : undefined;
};

const stringifyError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const toPiResult = (
  value: unknown,
  formatter: PiToolResultFormatter,
  details: PiToolDetails = {}
): AgentToolResult<PiToolDetails> => ({
  content: [{ type: 'text' as const, text: formatter(value) }],
  details: {
    ...details,
    result: value,
  },
});

const toPiErrorResult = (
  error: unknown,
  formatter: PiToolResultFormatter,
  details: PiToolDetails = {}
): AgentToolResult<PiToolDetails> => {
  const message = stringifyError(error);
  const value = {
    successful: false,
    error: message,
    data: null,
  };
  return {
    content: [{ type: 'text' as const, text: formatter(value) }],
    details: {
      ...details,
      error: message,
      result: value,
    },
  };
};

const objectInputSchema = (schema: ComposioTool['inputParameters'] | undefined): TSchema => {
  const candidate =
    schema && typeof schema === 'object'
      ? ({ ...schema } as Record<string, unknown>)
      : ({ ...EmptyObjectSchema } as Record<string, unknown>);
  if (!candidate.type) candidate.type = 'object';
  if (!candidate.properties) candidate.properties = {};
  if (candidate.additionalProperties === undefined) candidate.additionalProperties = true;
  return Type.Unsafe(candidate);
};

const optionalRecordSchema = (description: string) =>
  Type.Optional(Type.Record(Type.String(), Type.Any(), { description }));

const manualAuthorizeFallback = async (
  session: PiComposioSessionLike,
  toolkits: string[],
  callbackUrl: string | undefined
): Promise<unknown> => {
  if (!session.authorize) {
    throw new Error('This Composio session does not support authorize().');
  }

  const results: Record<string, unknown> = {};
  for (const toolkit of toolkits) {
    const request = await session.authorize(toolkit, { callbackUrl });
    results[toolkit] = {
      status: 'initiated',
      redirectUrl: request.redirectUrl ?? request.redirect_url,
      connectedAccountId: request.connectedAccountId ?? request.id,
    };
  }

  return {
    successful: true,
    data: {
      message: 'Connection flow initiated via session.authorize fallback.',
      results,
    },
    error: null,
  };
};

const maybeTransform = async (
  options: PiSessionToolOptions,
  params: Parameters<NonNullable<PiSessionToolOptions['transformResult']>>[0]
): Promise<unknown> => (options.transformResult ? options.transformResult(params) : params.value);

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
      prepareArguments: args => normalizeToolArguments(args, composioTool.slug) as Static<typeof schema>,
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

  /**
   * Create Slack-bot-style dynamic Composio helpers for a Tool Router session.
   *
   * These helpers are useful when Pi should search and execute tools dynamically
   * instead of preloading a static list of concrete tool slugs.
   */
  createSessionTools(
    session: PiComposioSessionLike,
    options: PiSessionToolOptions = {}
  ): PiToolCollection {
    const mergedOptions = { ...this.options, ...options };
    const formatter = mergedOptions.formatResult ?? defaultFormatResult;
    const catchErrors = mergedOptions.catchErrors ?? true;
    const names = { ...DEFAULT_SESSION_TOOL_NAMES, ...(options.names ?? {}) };
    const executionMode = mergedOptions.executionMode;

    const searchTools = defineTool({
      name: names.search,
      label: 'Composio Search Tools',
      description:
        'Search Composio for tools that can perform a requested action. Search globally by default; pass toolkits only when intentionally narrowing the search.',
      promptSnippet: 'Use composio_search_tools to discover exact Composio tool slugs and schemas before executing app actions.',
      promptGuidelines: [
        'Search Composio before inventing tool slugs or arguments.',
        'Only pass a toolkit filter when you intentionally want to narrow search results.',
      ],
      parameters: Type.Object({
        query: Type.String({ description: 'Natural language description of the action to perform.' }),
        toolkits: ToolkitsSchema,
      }),
      ...(executionMode ? { executionMode } : {}),
      execute: async (_toolCallId, params) => {
        try {
          const toolkits = normalizeToolkits(params.toolkits);
          const value = await session.search({
            query: params.query,
            ...(toolkits ? { toolkits } : {}),
          });
          const transformed = await maybeTransform(options, {
            tool: 'search',
            requestedToolkits: toolkits,
            value,
          });
          return toPiResult(transformed, formatter, { slug: names.search });
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
      promptSnippet: 'Use composio_manage_connections when a searched tool requires a missing app connection.',
      promptGuidelines: [
        'When an app connection is missing, call composio_manage_connections with the toolkit slug.',
        'Never ask the user for OAuth secrets or API keys directly.',
      ],
      parameters: Type.Object({
        toolkits: Type.Array(Type.String({ description: 'Toolkit slugs to check/connect, e.g. github, gmail.' })),
        reinitiate_all: Type.Optional(
          Type.Boolean({ description: 'Force reconnection even if active connections exist.' })
        ),
      }),
      ...(executionMode ? { executionMode } : {}),
      execute: async (_toolCallId, params) => {
        const toolkits = normalizeToolkits(params.toolkits) ?? [];
        try {
          let value: unknown;
          try {
            value = await session.execute('COMPOSIO_MANAGE_CONNECTIONS', {
              toolkits,
              reinitiate_all: params.reinitiate_all ?? false,
              session_id: session.sessionId,
            });
          } catch (error) {
            if (toolkits.length === 0) throw error;
            value = await manualAuthorizeFallback(session, toolkits, options.callbackUrl);
          }

          const transformed = await maybeTransform(options, {
            tool: 'manageConnections',
            requestedToolkits: toolkits,
            value,
          });
          return toPiResult(transformed, formatter, { slug: names.manageConnections });
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
        'Execute an exact Composio tool slug using the current Tool Router session. Use search first so the slug and arguments match the schema.',
      promptSnippet: 'Use composio_execute_tool to execute an exact Composio tool slug returned by composio_search_tools.',
      promptGuidelines: [
        'Always use exact tool slugs and schema-compliant arguments.',
        'For missing connections, use composio_manage_connections instead of asking for credentials.',
      ],
      parameters: Type.Object({
        toolSlug: Type.String({ description: 'Exact Composio tool slug, e.g. GITHUB_CREATE_ISSUE.' }),
        arguments: optionalRecordSchema('Tool arguments matching the searched schema.'),
        account: Type.Optional(
          Type.String({
            description:
              'Optional account selector for multi-account sessions. Use connected account id or alias when required.',
          })
        ),
      }),
      ...(executionMode ? { executionMode } : {}),
      prepareArguments: args => normalizeToolArguments(args, names.execute) as {
        toolSlug: string;
        arguments?: Record<string, unknown>;
        account?: string;
      },
      execute: async (_toolCallId, params) => {
        const toolSlug = params.toolSlug.trim();
        const args = params.arguments ?? {};
        try {
          const value = await session.execute(toolSlug, args, {
            ...(params.account ? { account: params.account } : {}),
          });
          const transformed = await maybeTransform(options, {
            tool: 'execute',
            requestedToolkits: toolkitFromToolSlug(toolSlug) ? [toolkitFromToolSlug(toolSlug)!] : undefined,
            value,
          });
          return toPiResult(transformed, formatter, { slug: toolSlug });
        } catch (error) {
          if (!catchErrors) throw error;
          return toPiErrorResult(error, formatter, { slug: toolSlug || names.execute });
        }
      },
    });

    return [searchTools, manageConnections, executeTool];
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

export const createPiComposioSystemPrompt = (sessionId?: string): string =>
  [
    'You have Composio tools for working across the user\'s connected apps.',
    'Use composio_search_tools to find the right tool before executing app actions.',
    'Use composio_manage_connections when an app is not connected; never ask for OAuth secrets or API keys.',
    'Use composio_execute_tool with exact tool slugs and schema-compliant arguments from search results.',
    sessionId ? `Composio session id: ${sessionId}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');

export const extractComposioConnectLinks = (value: unknown): string[] => {
  const text = stringifyUnknown(value);
  const connectLinks = text.match(/https:\/\/connect\.composio\.dev\/[^\s<>)"']+/gi) ?? [];
  const genericLinks = text.match(/https:\/\/[^\s<>)"']*composio[^\s<>)"']*\/link\/[^\s<>)"']+/gi) ?? [];
  return [...new Set([...connectLinks, ...genericLinks].map(url => url.replace(/[.,;:!?]+$/g, '')))];
};

const stringifyUnknown = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const toolkitFromToolSlug = (toolSlug: string): string | undefined => {
  const normalized = toolSlug.trim().toLowerCase();
  if (!normalized || normalized.startsWith('composio_')) return undefined;

  const knownPrefixes: Array<[string, string]> = [
    ['google_calendar_', 'googlecalendar'],
    ['google_drive_', 'googledrive'],
    ['microsoft_teams_', 'microsoftteams'],
  ];
  for (const [prefix, toolkit] of knownPrefixes) {
    if (normalized.startsWith(prefix)) return toolkit;
  }

  const [prefix] = normalized.split('_');
  return prefix || undefined;
};

export { DEFAULT_SESSION_TOOL_NAMES as PI_COMPOSIO_SESSION_TOOL_NAMES };
