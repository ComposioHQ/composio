import z from 'zod/v3';
import { BaseComposioProvider } from '../provider/BaseProvider';
import { ExecuteToolModifiers, ProviderOptions } from './modifiers.types';
import { ConnectionRequest } from './connectionRequest.types';

export const MCPServerTypeSchema = z.enum(['HTTP', 'SSE']);
export type MCPServerType = z.infer<typeof MCPServerTypeSchema>;

// manage connections
export const ToolRouterConfigManageConnectionsSchema = z
  .object({
    enabled: z
      .boolean()
      .default(true)
      .optional()
      .describe(
        'Whether to use tools to manage connections in the tool router session. Defaults to true, if set to false, you need to manage connections manually'
      ),
    callbackUri: z
      .string()
      .optional()
      .describe('The callback uri to use in the tool router session'),
    inferScopesFromTools: z
      .boolean()
      .default(false)
      .optional()
      .describe(
        'Whether to infer scopes from tools in the tool router session. Defaults to false, if set to true, tool router will infer scopes from allowed tools'
      ),
  })
  .strict();

// toolkits
export const ToolRouterToolkitsParamSchema = z
  .array(z.string())
  .describe('List of toolkits to enable in the tool router session');

export const ToolRouterToolkitsDisabledConfigSchema = z
  .object({
    disabled: ToolRouterToolkitsParamSchema.describe(
      'List of toolkits to disable in the tool router session'
    ),
  })
  .strict();
export const ToolRouterToolkitsEnabledConfigSchema = z
  .object({
    enabled: ToolRouterToolkitsParamSchema.describe(
      'List of toolkits to enable in the tool router session'
    ),
  })
  .strict();

export const ToolRouterManageConnectionsConfigSchema = z.object({
  enabled: z
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
    enabled: ToolRouterTagsParamSchema.describe('The tags to enable in the tool router session'),
  })
  .strict();
export const ToolRouterDisabledTagsConfigSchema = z
  .object({
    disabled: ToolRouterTagsParamSchema.describe('The tags to disable in the tool router session'),
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
 *  Tools config
 * @example
 * ```typescript
 *  {
 *      overrides: {
 *          gmail: {
 *              enabled: ['gmail_search', 'gmail_send'],
 *              disabled: ['gmail_delete']
 *          }
 *      }
 *      filters: {
 *          tags: {
 *              enabled: ['gmail', 'gmail_search', 'gmail_send'],
 *              disabled: ['gmail_delete']
 *          }
 *      }
 *  }
 * ```
 *
 * @example
 * ```typescript
 *  {
 *      overrides: {
 *          gmail: ['gmail_search', 'gmail_send']
 *      },
 *      filters: {
 *          tags: ['gmail', 'gmail_search', 'gmail_send']
 *      }
 *  }
 * ```
 */
export const ToolRouterToolsParamSchema = z
  .array(z.string())
  .describe('The tools to use in the tool router session');
export const ToolRouterConfigToolsSchema = z
  .object({
    overrides: z
      .record(
        z.string(),
        z.union([
          ToolRouterToolsParamSchema,
          z
            .object({
              enabled: ToolRouterToolsParamSchema.describe(
                'The tools to enable in the tool router session'
              ),
            })
            .strict(),
          z
            .object({
              disabled: ToolRouterToolsParamSchema.describe(
                'The tools to disable in the tool router session'
              ),
            })
            .strict(),
        ])
      )
      .describe('The tools to override in the tool router session')
      .optional(),
    tags: ToolRouterConfigTagsSchema.optional().describe('The tags to filter the tools by'),
  })
  .strict();
export type ToolRouterConfigTools = z.infer<typeof ToolRouterConfigToolsSchema>;

export const ToolRouterCreateSessionConfigSchema = z
  .object({
    tools: ToolRouterConfigToolsSchema.optional().describe(
      'The tools to use in the tool router session'
    ),
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
    execution: z
      .object({
        proxyExecutionEnabled: z
          .boolean()
          .optional()
          .describe('Whether to enable proxy execution in the tool router session'),
        timeoutSeconds: z
          .number()
          .optional()
          .describe('The timeout in seconds for the tool router session'),
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
 * @param {ToolRouterToolsParamSchema | ToolRouterEnabledToolsConfigSchema | ToolRouterDisabledToolsConfigSchema} tools - The tools to use in the tool router session
 * @param {ToolRouterConfigManageConnectionsSchema | boolean} manageConnections - Whether to use tools to manage connections in the tool router session @default true
 * @param {Record<string, string>} authConfigs - The auth configs to use in the tool router session
 * @param {Record<string, string>} connectedAccounts - The connected accounts to use in the tool router session
 * @param {ToolRouterConfigManageConnectionsSchema | boolean} manageConnections - The config for the manage connections in the tool router session. Defaults to true, if set to false, you need to manage connections manually. If set to an object, you can configure the manage connections settings.
 * @param {boolean} [manageConnections.enabled] - Whether to use tools to manage connections in the tool router session @default true
 * @param {string} [manageConnections.callbackUri] - The callback uri to use in the tool router session
 * @param {boolean} [manageConnections.inferScopesFromTools] - Whether to infer scopes from tools in the tool router session @default false
 */
export type ToolRouterCreateSessionConfig = z.infer<typeof ToolRouterCreateSessionConfigSchema>;

export const ToolkitConnectionStateSchema = z
  .object({
    slug: z.string().describe('The slug of a toolkit'),
    name: z.string().describe('The name of a toolkit'),
    logo: z.string().optional().describe('The logo of a toolkit'),
    isNoAuth: z.boolean().default(false).describe('Whether the toolkit is no auth or not'),
    connection: z.object({
      isActive: z.boolean().describe('Whether the connection is active or not'),
      authConfig: z
        .object({
          id: z.string().describe('The id of the auth config'),
          mode: z.string().describe('The auth scheme used by the auth config'),
          isComposioManaged: z.boolean().describe('Whether the auth config is managed by Composio'),
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
    }),
  })
  .describe('The connection state of a toolkit');

export const ToolkitConnectionsDetailsSchema = z.object({
  items: z.array(ToolkitConnectionStateSchema),
  nextCursor: z.string().optional(),
  totalPages: z.number(),
});
export type ToolkitConnectionsDetails = z.infer<typeof ToolkitConnectionsDetailsSchema>;

export type ToolkitConnectionState = z.infer<typeof ToolkitConnectionStateSchema>;

export type ToolRouterMCPServerConfig = { type: MCPServerType; url: string };

export type ToolRouterToolsFn<
  TToolCollection,
  TTool,
  TProvider extends BaseComposioProvider<TToolCollection, TTool, unknown>,
> = (modifiers?: ProviderOptions<TProvider>) => Promise<ReturnType<TProvider['wrapTools']>>;

export type ToolRouterAuthorizeFn = (
  toolkit: string,
  options?: { callbackUrl?: string }
) => Promise<ConnectionRequest>;

export type ToolRouterToolkitsFn = (options?: {
  nextCursor?: string;
  limit?: number;
}) => Promise<ToolkitConnectionsDetails>;
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
   */
  mcp: ToolRouterMCPServerConfig;
  /**
   * The tools of the tool router session.
   */
  tools: ToolRouterToolsFn<TToolCollection, TTool, TProvider>;
  /**
   * The authorize function of the tool router session.
   */
  authorize: ToolRouterAuthorizeFn;
  toolkits: ToolRouterToolkitsFn;
}
