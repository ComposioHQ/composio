import z from 'zod/v3';
import { BaseComposioProvider } from '../provider/BaseProvider';
import { ExecuteToolModifiers } from './modifiers.types';
import { ConnectionRequest } from './connectionRequest.types';

export const MCPServerTypeSchema = z.enum(['http', 'sse']);
export type MCPServerType = z.infer<typeof MCPServerTypeSchema>;

export const ToolRouterToolkitsParamSchema = z
  .array(z.string())
  .describe('List of toolkits to enable in the tool router session');
export const ToolRouterToolkitsConfigSchema = z.object({
  disabled: ToolRouterToolkitsParamSchema.describe(
    'List of toolkits to disable in the tool router session'
  ).optional(),
});

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

export const ToolRouterConfigSchema = z
  .object({
    toolkits: z
      .union([ToolRouterToolkitsParamSchema, ToolRouterToolkitsConfigSchema])
      .optional()
      .describe('The toolkits to use in the tool router session')
      .default([]),
    manageConnections: z
      .union([z.boolean(), ToolRouterManageConnectionsConfigSchema])
      .optional()
      .default(true),
    authConfigs: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'The auth configs to use in the tool router session. The key is the toolkit slug, the value is the auth config id.'
      )
      .default({}),
    connectedAccounts: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'The connected accounts to use in the tool router session. The key is the toolkit slug, the value is the connected account id.'
      )
      .default({}),
  })
  .describe('The config for the tool router session');
export type ToolRouterConfig = z.infer<typeof ToolRouterConfigSchema>;

export const ToolkitConnectionStateSchema = z
  .object({
    meta: z.object({
      slug: z.string().describe('The slug of a toolkit'),
      name: z.string().describe('The name of a toolkit'),
      logo: z.string().optional().describe('The logo of a toolkit'),
    }),
    connection: z.object({
      isActive: z.boolean().describe('Whether the connection is active or not'),
      authConfig: z
        .object({
          id: z.string().describe('The id of the auth config'),
          name: z.string().describe('The name of the auth config'),
        })
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

export type ToolkitConnectionState = z.infer<typeof ToolkitConnectionStateSchema>;

export type ToolRouterMCPServerConfig = { type: MCPServerType; url: string };
export type ToolRouterToolsFn<
  TToolCollection,
  TTool,
  TProvider extends BaseComposioProvider<TToolCollection, TTool, unknown>,
> = (modifiers?: ExecuteToolModifiers) => ReturnType<TProvider['wrapTools']>;
export type ToolRouterAuthorizeFn = (
  toolkit: string,
  options?: { callbackUrl?: string }
) => Promise<ConnectionRequest>;
export type ToolRouterConectionsFn = () => Promise<Record<string, ToolkitConnectionState>>;
export interface ToolRouterSession<
  TToolCollection,
  TTool,
  TProvider extends BaseComposioProvider<TToolCollection, TTool, unknown>,
> {
  sessionId: string;
  mcp: ToolRouterMCPServerConfig;
  tools: ToolRouterToolsFn<TToolCollection, TTool, TProvider>;
  authorize: ToolRouterAuthorizeFn;
  conections: ToolRouterConectionsFn;
}
