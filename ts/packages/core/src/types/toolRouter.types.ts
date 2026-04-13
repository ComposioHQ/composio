import z from 'zod/v3';
import type { BaseComposioProvider } from '../provider/BaseProvider';
import { SessionMetaToolOptions } from './modifiers.types';
import { ConnectionRequest } from './connectionRequest.types';
import type { ToolRouterSessionFilesMount } from '../models/ToolRouterSessionFileMount';
import type {
  CustomTool,
  CustomToolkit,
  RegisteredCustomTool,
  RegisteredCustomToolkit,
} from './customTool.types';

export const MCPServerTypeSchema = z.enum(['http', 'sse']);
export type MCPServerType = z.infer<typeof MCPServerTypeSchema>;

// manage connections
export const ToolRouterConfigManageConnectionsSchema = z
  .object({
    enable: z
      .boolean()
      .default(true)
      .optional()
      .describe(
        'Whether to use tools to manage connections in the tool router session. Defaults to true, if set to false, you need to manage connections manually'
      ),
    callbackUrl: z
      .string()
      .optional()
      .describe('The callback uri to use in the tool router session'),
    waitForConnections: z
      .boolean()
      .optional()
      .describe(
        'Whether to wait for users to finish authenticating connections before proceeding to the next step. Defaults to false, if set to true, a wait for connections tool call will happen and finish when the connections are ready'
      ),
  })
  .strict();

// toolkits
export const ToolRouterToolkitsParamSchema = z
  .array(z.string())
  .describe('List of toolkits to enable in the tool router session');

export const ToolRouterToolkitsDisabledConfigSchema = z
  .object({
    disable: ToolRouterToolkitsParamSchema.describe(
      'List of toolkits to disable in the tool router session'
    ),
  })
  .strict();
export const ToolRouterToolkitsEnabledConfigSchema = z
  .object({
    enable: ToolRouterToolkitsParamSchema.describe(
      'List of toolkits to enable in the tool router session'
    ),
  })
  .strict();

export const ToolRouterManageConnectionsConfigSchema = z.object({
  enable: z
    .boolean()
    .optional()
    .describe(
      'Whether to use tools to manage connections in the tool router session. Defaults to true, if set to false, you need to manage connections manually'
    )
    .default(true),
  callbackUrl: z.string().optional().describe('The callback url to use in the tool router session'),
});

// Tags
export const ToolRouterTagsParamSchema = z
  .array(z.enum(['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']))
  .describe('The tags to filter the tools by');
export const ToolRouterTagsEnableDisableSchema = z
  .object({
    enable: ToolRouterTagsParamSchema.optional().describe(
      'The tags to enable in the tool router session'
    ),
    disable: ToolRouterTagsParamSchema.optional().describe(
      'The tags to disable in the tool router session'
    ),
  })
  .strict();
export const ToolRouterConfigTagsSchema = z
  .union([ToolRouterTagsParamSchema, ToolRouterTagsEnableDisableSchema])
  .describe('The tags to use in the tool router session');
export type ToolRouterConfigTags = z.infer<typeof ToolRouterConfigTagsSchema>;

/**
 *  Tools config - Configure tools per toolkit using toolkit slug as key
 * @example
 * ```typescript
 *  {
 *      gmail: {
 *          enable: ['gmail_search', 'gmail_send']
 *      },
 *      slack: {
 *          disable: ['slack_delete_message']
 *      }
 *  }
 * ```
 *
 * @example
 * ```typescript
 *  {
 *      gmail: ['gmail_search', 'gmail_send'],
 *      slack: { tags: ['readOnlyHint'] }
 *  }
 * ```
 */
export const ToolRouterToolsParamSchema = z
  .array(z.string())
  .describe('The tools to use in the tool router session');
export type ToolRouterToolsParam = z.infer<typeof ToolRouterToolsParamSchema>;

export const ToolRouterConfigToolsSchema = z
  .union([
    ToolRouterToolsParamSchema,
    z
      .object({
        enable: ToolRouterToolsParamSchema.describe(
          'The tools to enable in the tool router session'
        ),
      })
      .strict(),
    z
      .object({
        disable: ToolRouterToolsParamSchema.describe(
          'The tools to disable in the tool router session'
        ),
      })
      .strict(),
    z
      .object({
        tags: ToolRouterConfigTagsSchema.describe(
          'The tags to filter the tools by, this will override the global tags'
        ),
      })
      .strict(),
  ])
  .superRefine((val, ctx) => {
    // If it's an object (not an array), ensure only one property is present
    if (typeof val === 'object' && !Array.isArray(val)) {
      const keys = Object.keys(val);
      if (keys.length > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Only one of 'enable', 'disable', or 'tags' can be specified, but found: ${keys.join(', ')}`,
          path: keys,
        });
      }
    }
  });
export type ToolRouterConfigTools = z.infer<typeof ToolRouterConfigToolsSchema>;

export const ToolRouterCreateSessionConfigSchema = z
  .object({
    tools: z
      .record(z.string(), z.union([ToolRouterToolsParamSchema, ToolRouterConfigToolsSchema]))
      .optional()
      .describe('The tools to use in the tool router session'),

    tags: ToolRouterConfigTagsSchema.optional().describe('Global tags to filter the tools by'),

    toolkits: z
      .union([
        ToolRouterToolkitsParamSchema,
        ToolRouterToolkitsDisabledConfigSchema,
        ToolRouterToolkitsEnabledConfigSchema,
      ])
      .optional()
      .describe('The toolkits to use in the tool router session'),

    authConfigs: z
      .record(z.string(), z.string())
      .describe(
        'The auth configs to use in the tool router session. The key is the toolkit slug, the value is the auth config id.'
      )
      .default({}),
    connectedAccounts: z
      .record(z.string(), z.string())
      .describe(
        'The connected accounts to use in the tool router session. The key is the toolkit slug, the value is the connected account id.'
      )
      .default({}),
    manageConnections: z
      .union([z.boolean(), ToolRouterConfigManageConnectionsSchema])
      .optional()
      .default(true)
      .describe(
        'The config for the manage connections in the tool router session. Defaults to true, if set to false, you need to manage connections manually. If set to an object, you can configure the manage connections settings.'
      ),
    workbench: z
      .object({
        enable: z
          .boolean()
          .default(true)
          .describe(
            'Whether to enable the workbench entirely. Defaults to true. When set to false, no code execution tools (COMPOSIO_REMOTE_WORKBENCH, COMPOSIO_REMOTE_BASH_TOOL) are available in the session.'
          ),
        enableProxyExecution: z
          .boolean()
          .optional()
          .describe('Whether to enable proxy execution in the tool router session'),
        autoOffloadThreshold: z
          .number()
          .optional()
          .describe(
            'The auto offload threshold in characters for the tool execution to be moved into workbench'
          ),
      })
      .optional()
      .describe('The workbench config for the tool router session'),
    multiAccount: z
      .object({
        enable: z
          .boolean()
          .default(false)
          .describe('When true, enables multi-account mode for this session. Defaults to false.'),
        maxAccountsPerToolkit: z
          .number()
          .int()
          .min(2)
          .max(10)
          .optional()
          .describe(
            'Maximum number of connected accounts allowed per toolkit. Defaults to 5 when multi-account is enabled.'
          ),
        requireExplicitSelection: z
          .boolean()
          .optional()
          .describe(
            'When true, require explicit account selection when multiple accounts are connected. When false (default), use the first/default account.'
          ),
      })
      .optional()
      .describe('Multi-account configuration for this session'),

    experimental: z
      .object({
        assistivePrompt: z
          .object({
            userTimezone: z
              .string()
              .optional()
              .describe(
                'IANA timezone identifier (e.g., "America/New_York", "Europe/London") for timezone-aware assistive prompts'
              ),
          })
          .optional()
          .describe('Configuration for assistive prompt generation'),
        customTools: z
          .array(z.custom<CustomTool>())
          .optional()
          .describe(
            'Custom tools to include in this session. Created via createCustomTool() from @composio/core/experimental.'
          ),
        customToolkits: z
          .array(z.custom<CustomToolkit>())
          .optional()
          .describe(
            'Custom toolkits to include in this session. Created via createCustomToolkit() from @composio/core/experimental.'
          ),
      })
      .optional()
      .describe('Experimental features configuration - not stable, may be modified or removed'),
  })
  .partial()
  .describe('The config for the tool router session');
/**
 * The config for the tool router session.
 *
 * @param {ToolRouterToolkitsParamSchema | ToolRouterToolkitsDisabledConfigSchema | ToolRouterToolkitsEnabledConfigSchema} toolkits - The toolkits to use in the tool router session
 * @param {Record<string, ToolRouterToolsParam | ToolRouterConfigTools>} tools - The tools to configure per toolkit (key is toolkit slug)
 * @param {Array<'readOnlyHint' | 'destructiveHint' | 'idempotentHint' | 'openWorldHint'>} tags - Global tags to filter tools by behavior
 * @param {Record<string, string>} authConfigs - The auth configs to use in the tool router session
 * @param {Record<string, string>} connectedAccounts - The connected accounts to use in the tool router session
 * @param {ToolRouterConfigManageConnectionsSchema | boolean} manageConnections - The config for the manage connections in the tool router session. Defaults to true, if set to false, you need to manage connections manually. If set to an object, you can configure the manage connections settings.
 * @param {boolean} [manageConnections.enable] - Whether to use tools to manage connections in the tool router session @default true
 * @param {string} [manageConnections.callbackUrl] - The callback url to use in the tool router session
 * @param {object} workbench - Workbench configuration for tool execution
 * @param {boolean} [workbench.enable] - Whether to enable the workbench entirely. Defaults to true. When false, no code execution tools are available.
 * @param {boolean} [workbench.enableProxyExecution] - Whether to enable proxy execution
 * @param {number} [workbench.autoOffloadThreshold] - Auto offload threshold in characters for moving execution to workbench
 * @param {object} [multiAccount] - Multi-account configuration for this session
 * @param {boolean} [multiAccount.enable] - When true, enables multi-account mode. Falls back to org/project-level config when not set.
 * @param {number} [multiAccount.maxAccountsPerToolkit] - Max connected accounts per toolkit (2-10, default 5)
 * @param {boolean} [multiAccount.requireExplicitSelection] - When true, require explicit account selection when multiple accounts are connected
 */
export type ToolRouterCreateSessionConfig = z.infer<typeof ToolRouterCreateSessionConfigSchema>;

export const ToolkitConnectionStateSchema = z
  .object({
    slug: z.string().describe('The slug of a toolkit'),
    name: z.string().describe('The name of a toolkit'),
    logo: z.string().optional().describe('The logo of a toolkit'),
    isNoAuth: z.boolean().default(false).describe('Whether the toolkit is no auth or not'),
    connection: z
      .object({
        isActive: z.boolean().describe('Whether the connection is active or not'),
        authConfig: z
          .object({
            id: z.string().describe('The id of the auth config'),
            mode: z.string().describe('The auth scheme used by the auth config'),
            isComposioManaged: z
              .boolean()
              .describe('Whether the auth config is managed by Composio'),
          })
          .nullish()
          .describe('The auth config of a toolkit'),
        connectedAccount: z
          .object({
            id: z.string().describe('The id of the connected account'),
            status: z.string().describe('The status of the connected account'),
          })
          .optional()
          .describe('The connected account of a toolkit'),
      })
      .optional()
      .describe('The connection of a toolkit'),
  })
  .describe('The connection state of a toolkit');

export const ToolkitConnectionsDetailsSchema = z.object({
  items: z.array(ToolkitConnectionStateSchema),
  nextCursor: z.string().optional(),
  totalPages: z.number(),
});
export type ToolkitConnectionsDetails = z.infer<typeof ToolkitConnectionsDetailsSchema>;

export type ToolkitConnectionState = z.infer<typeof ToolkitConnectionStateSchema>;

export const ToolRouterMCPServerConfigSchema = z.object({
  type: MCPServerTypeSchema,
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
});
export type ToolRouterMCPServerConfig = z.infer<typeof ToolRouterMCPServerConfigSchema>;

export type ToolRouterToolsFn<
  TToolCollection,
  TTool,
  TProvider extends BaseComposioProvider<TToolCollection, TTool, unknown>,
> = (modifiers?: SessionMetaToolOptions) => Promise<ReturnType<TProvider['wrapTools']>>;

export type ToolRouterAuthorizeFn = (
  toolkit: string,
  options?: { callbackUrl?: string; alias?: string }
) => Promise<ConnectionRequest>;

export const ToolRouterToolkitsOptionsSchema = z.object({
  toolkits: z.array(z.string()).optional(),
  nextCursor: z.string().optional(),
  limit: z.number().optional(),
  isConnected: z.boolean().optional(),
  search: z.string().optional(),
});
export type ToolRouterToolkitsOptions = z.infer<typeof ToolRouterToolkitsOptionsSchema>;

export type ToolRouterToolkitsFn = (
  options?: ToolRouterToolkitsOptions
) => Promise<ToolkitConnectionsDetails>;

// --- Session search response schemas (camelCase) ---

const ToolRouterSessionSearchResultReferenceWorkbenchSnippetSchema = z.object({
  code: z.string(),
  description: z.string(),
});

const ToolRouterSessionSearchResultSchema = z.object({
  index: z.number(),
  useCase: z.string(),
  primaryToolSlugs: z.array(z.string()),
  relatedToolSlugs: z.array(z.string()),
  toolkits: z.array(z.string()),
  difficulty: z.string().optional(),
  error: z.string().nullable().optional(),
  executionGuidance: z.string().optional(),
  knownPitfalls: z.array(z.string()).optional(),
  memory: z.record(z.string(), z.array(z.string())).optional(),
  planId: z.string().optional(),
  recommendedPlanSteps: z.array(z.string()).optional(),
  referenceWorkbenchSnippets: z
    .array(ToolRouterSessionSearchResultReferenceWorkbenchSnippetSchema)
    .optional(),
});

const ToolRouterSessionSearchSessionSchema = z.object({
  id: z.string(),
  generateId: z.boolean(),
  instructions: z.string(),
});

const ToolRouterSessionSearchTimeInfoSchema = z.object({
  currentTimeUtc: z.string(),
  currentTimeUtcEpochSeconds: z.number(),
  message: z.string(),
});

const ToolRouterSessionSearchToolSchemasSchemaRefSchema = z.object({
  args: z.object({ toolSlugs: z.array(z.string()) }),
  message: z.string().optional(),
  tool: z.literal('COMPOSIO_GET_TOOL_SCHEMAS'),
});

const ToolRouterSessionSearchToolSchemaSchema = z.object({
  toolSlug: z.string(),
  toolkit: z.string(),
  description: z.string().optional(),
  hasFullSchema: z.boolean().optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  schemaRef: ToolRouterSessionSearchToolSchemasSchemaRefSchema.optional(),
});

const ToolRouterSessionSearchToolkitConnectionStatusSchema = z.object({
  toolkit: z.string(),
  description: z.string(),
  hasActiveConnection: z.boolean(),
  statusMessage: z.string(),
  connectionDetails: z.record(z.string(), z.unknown()).optional(),
  currentUserInfo: z.record(z.string(), z.unknown()).optional(),
});

export const ToolRouterSessionSearchResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().nullable(),
  results: z.array(ToolRouterSessionSearchResultSchema),
  toolSchemas: z.record(z.string(), ToolRouterSessionSearchToolSchemaSchema),
  toolkitConnectionStatuses: z.array(ToolRouterSessionSearchToolkitConnectionStatusSchema),
  nextStepsGuidance: z.array(z.string()),
  session: ToolRouterSessionSearchSessionSchema,
  timeInfo: ToolRouterSessionSearchTimeInfoSchema,
});
export type ToolRouterSessionSearchResponse = z.infer<typeof ToolRouterSessionSearchResponseSchema>;

// --- Session execute response schema (camelCase) ---

export const ToolRouterSessionExecuteResponseSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  error: z.string().nullable(),
  logId: z.string(),
});
export type ToolRouterSessionExecuteResponse = z.infer<
  typeof ToolRouterSessionExecuteResponseSchema
>;

// --- Session proxy execute response (matches ToolProxyResponse from client) ---

export interface ToolRouterSessionProxyExecuteResponse {
  /** The HTTP status code returned from the proxied API */
  status: number;
  /** The response data from the proxied API */
  data?: unknown;
  /** HTTP headers from the proxied API */
  headers?: Record<string, string>;
  /** Binary response data (present when response is a file) */
  binaryData?: {
    contentType: string;
    size: number;
    url: string;
    expiresAt?: string;
  };
}

/**
 * Experimental features on a tool router session.
 * Contains features that may be modified or removed in future versions.
 */
export interface SessionExperimental {
  /**
   * The assistive system prompt to inject into your agent for optimal tool router usage.
   * Only returned on session creation, not on GET.
   */
  assistivePrompt?: string;
  /**
   * File mount operations (list, upload, download, delete) for the session's virtual filesystem.
   */
  files: ToolRouterSessionFilesMount;
}

export type ToolRouterSessionSearchFn = (params: {
  query: string;
  toolkits?: string[];
}) => Promise<ToolRouterSessionSearchResponse>;

export type ToolRouterSessionExecuteFn = (
  toolSlug: string,
  arguments_?: Record<string, unknown>
) => Promise<ToolRouterSessionExecuteResponse>;

export const SessionProxyExecuteParamsSchema = z.object({
  /** The toolkit whose connected account to use for auth (e.g. 'gmail', 'github') */
  toolkit: z.string(),
  /** The API endpoint URL to call */
  endpoint: z.string(),
  /** HTTP method */
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  /** Request body (for POST/PUT/PATCH) */
  body: z.unknown().optional(),
  /** Query params or headers to include */
  parameters: z
    .array(
      z.object({
        in: z.enum(['query', 'header']),
        name: z.string(),
        value: z.union([z.string(), z.number()]),
      })
    )
    .optional(),
});
export type SessionProxyExecuteParams = z.infer<typeof SessionProxyExecuteParamsSchema>;

export type ToolRouterSessionProxyExecuteFn = (
  params: SessionProxyExecuteParams
) => Promise<ToolRouterSessionProxyExecuteResponse>;

/** Session type returned by ToolRouter.create() and ToolRouter.use() */
export interface Session<
  TToolCollection,
  TTool,
  TProvider extends BaseComposioProvider<TToolCollection, TTool, unknown>,
> {
  sessionId: string;
  mcp: ToolRouterMCPServerConfig;
  tools: ToolRouterToolsFn<TToolCollection, TTool, TProvider>;
  authorize: ToolRouterAuthorizeFn;
  toolkits: ToolRouterToolkitsFn;
  /** Search for tools by semantic use case */
  search: ToolRouterSessionSearchFn;
  /** Execute a tool within the session */
  execute: ToolRouterSessionExecuteFn;
  /** Proxy an API call through Composio's auth layer using the session's connected account */
  proxyExecute: ToolRouterSessionProxyExecuteFn;
  /** List custom tools registered in this session, with their final slugs and schemas */
  customTools: (options?: { toolkit?: string }) => RegisteredCustomTool[];
  /** List custom toolkits registered in this session, with final slugs on nested tools */
  customToolkits: () => RegisteredCustomToolkit[];
  /** Experimental features (files, assistive prompt, etc.) */
  experimental: SessionExperimental;
}
