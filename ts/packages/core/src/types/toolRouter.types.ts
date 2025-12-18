import z from 'zod/v3';
import { BaseComposioProvider } from '../provider/BaseProvider';
import { ExecuteToolModifiers, ProviderOptions } from './modifiers.types';
import { ConnectionRequest } from './connectionRequest.types';

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
  .array(z.string())
  .describe('The tags to use in the tool router session');
export const ToolRouterEnabledTagsConfigSchema = z
  .object({
    enable: ToolRouterTagsParamSchema.describe('The tags to enable in the tool router session'),
  })
  .strict();
export const ToolRouterDisabledTagsConfigSchema = z
  .object({
    disable: ToolRouterTagsParamSchema.describe('The tags to disable in the tool router session'),
  })
  .strict();
export const ToolRouterConfigTagsSchema = z
  .union([
    ToolRouterTagsParamSchema,
    ToolRouterEnabledTagsConfigSchema,
    ToolRouterDisabledTagsConfigSchema,
  ])
  .describe('The tags to use in the tool router session');

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

export const ToolRouterToolsTagsParamSchema = z
  .array(z.enum(['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']))
  .describe('The tags to filter the tools by');
export type ToolRouterToolsTagsParam = z.infer<typeof ToolRouterToolsTagsParamSchema>;

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
        tags: ToolRouterToolsTagsParamSchema.describe(
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

    tags: ToolRouterToolsTagsParamSchema.optional().describe('Global tags to filter the tools by'),

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
      .describe('The execution config for the tool router session'),
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
 * @param {boolean} [workbench.proxyExecutionEnabled] - Whether to enable proxy execution
 * @param {number} [workbench.autoOffloadThreshold] - Auto offload threshold in characters for moving execution to workbench
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
> = (modifiers?: ProviderOptions<TProvider>) => Promise<ReturnType<TProvider['wrapTools']>>;

export type ToolRouterAuthorizeFn = (
  toolkit: string,
  options?: { callbackUrl?: string }
) => Promise<ConnectionRequest>;

export const ToolRouterToolkitsOptionsSchema = z.object({
  toolkits: z.array(z.string()).optional(),
  nextCursor: z.string().optional(),
  limit: z.number().optional(),
  isConnected: z.boolean().optional(),
});
export type ToolRouterToolkitsOptions = z.infer<typeof ToolRouterToolkitsOptionsSchema>;

export type ToolRouterToolkitsFn = (
  options?: ToolRouterToolkitsOptions
) => Promise<ToolkitConnectionsDetails>;
export interface ToolRouterSession<
  TToolCollection,
  TTool,
  TProvider extends BaseComposioProvider<TToolCollection, TTool, unknown>,
> {
  /**
   * The session id of the tool router session.
   */
  sessionId: string;
  /**
   * The MCP server config of the tool router session.
   * Contains the URL, type ('http' or 'sse'), and headers for authentication.
   */
  mcp: ToolRouterMCPServerConfig;
  /**
   * Get the tools available in the session, formatted for your AI framework.
   * Requires a provider to be configured in the Composio constructor.
   */
  tools: ToolRouterToolsFn<TToolCollection, TTool, TProvider>;
  /**
   * Initiate an authorization flow for a toolkit.
   * Returns a ConnectionRequest with a redirect URL for the user.
   */
  authorize: ToolRouterAuthorizeFn;
  /**
   * Query the connection state of toolkits in the session.
   * Supports pagination and filtering by toolkit slugs.
   */
  toolkits: ToolRouterToolkitsFn;
}
