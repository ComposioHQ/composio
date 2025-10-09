import z from 'zod/v3';

export const MCPServerInstanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.literal('streamable_http'),
  url: z.string(),
  userId: z.string(),
  allowedTools: z.array(z.string()),
  authConfigs: z.array(z.string()),
});
export type MCPServerInstance = z.infer<typeof MCPServerInstanceSchema>;

/**
 * MCP Create Method Input Types
 */
export const MCPConfigToolkitsSchema = z.object({
  toolkit: z.string().describe('Id of the toolkit').optional(),
  authConfigId: z.string().describe('Id of the auth config').optional(),
});

export const MCPConfigCreationParamsSchema = z.object({
  toolkits: z.array(z.union([MCPConfigToolkitsSchema, z.string()])),
  allowedTools: z.array(z.string()).optional(),
  manuallyManageConnections: z
    .boolean()
    .default(false)
    .optional()
    .describe(
      `Whether to manually manage accounts. If true, you need to manage accounts manually connect user accounts. 
If set to false, composio will inject account maangement tools into your mcp server for agents to request and authenticate accounts.
defaults to false`
    ),
});
export type MCPConfigCreationParams = z.infer<typeof MCPConfigCreationParamsSchema>;

export const MCPConfigResponseSchema = z.object({
  /**
   * Unique identifier for the newly created custom MCP server
   */
  id: z.string(),

  /**
   * Human-readable name of the custom MCP server
   */
  name: z.string(),

  /**
   * List of tool identifiers that are enabled for this server
   */
  allowedTools: z.array(z.string()),

  /**
   * ID references to the auth configurations used by this server
   */
  authConfigIds: z.array(z.string()),

  /**
   * Set of command line instructions for connecting various clients to this MCP server
   */
  commands: z.object({
    /**
     * Command line instruction for Claude client setup
     */
    claude: z.string(),

    /**
     * Command line instruction for Cursor client setup
     */
    cursor: z.string(),

    /**
     * Command line instruction for Windsurf client setup
     */
    windsurf: z.string(),
  }),

  /**
   * URL endpoint for establishing Server-Sent Events (SSE) connection to this MCP server
   */
  MCPUrl: z.string(),
});

export type MCPConfigResponse = z.infer<typeof MCPConfigResponseSchema>;
export interface MCPConfigCreateResponse extends MCPConfigResponse {
  /**
   * Creates an instance for a user of the specific MCP Server/COnfig
   * @param userId {string}
   * @returns {MCPServerInstance}
   */
  generate: (userId: string) => Promise<MCPServerInstance>;
}

export const MCPGetInstanceParamsSchema = z.object({
  manuallyManageConnections: z
    .boolean()
    .default(false)
    .optional()
    .describe(
      `Whether to manually manage accounts. If true, you need to manage accounts manually connect user accounts. 
If set to false, composio will inject account maangement tools into your mcp server for agents to request and authenticate accounts.
defaults to false`
    ),
});
export type MCPGetInstanceParams = z.infer<typeof MCPGetInstanceParamsSchema>;

export const MCPListParamsSchema = z.object({
  page: z.number().optional().default(1),
  limit: z.number().optional().default(10),
  toolkits: z.array(z.string()).optional().default([]),
  authConfigs: z.array(z.string()).optional().default([]),
  name: z.string().optional(),
});
export type MCPListParams = z.infer<typeof MCPListParamsSchema>;

export const MCPItemSchema = MCPConfigResponseSchema.extend({
  ...z.object({
    toolkitIcons: z.record(z.string(), z.string()),
    serverInstanceCount: z.number(),
    toolkits: z.array(z.string()),
  }).shape,
});
export type MCPItem = z.infer<typeof MCPItemSchema>;
export const MCPListResponseSchema = z.object({
  items: z.array(MCPItemSchema),
  currentPage: z.number(),
  totalPages: z.number(),
});
export type MCPListResponse = z.infer<typeof MCPListResponseSchema>;

export const MCPUpdateParamsSchema = z.object({
  name: z.string().optional(),
  toolkits: z.array(z.union([MCPConfigToolkitsSchema, z.string()])).optional(),
  allowedTools: z.array(z.string()).optional(),
  manuallyManageConnections: z
    .boolean()
    .optional()
    .describe(
      `Whether to manually manage accounts. If true, you need to manage accounts manually connect user accounts. 
If set to false, composio will inject account maangement tools into your mcp server for agents to request and authenticate accounts.
defaults to false`
    ),
});
export type MCPUpdateParams = z.infer<typeof MCPUpdateParamsSchema>;

export const MCPServerConnectionStatus = z.object({
  connected: z.boolean(),
  toolkit: z.string(),
  connectedAccountId: z.string(),
});
export type MCPServerConnectionStatus = z.infer<typeof MCPServerConnectionStatus>;

export const MCPServerConnectedAccountsSchema = z.record(
  z.string(),
  z.array(
    z.object({
      toolkit: z.string(),
      authConfigId: z.string(),
      connectedAccountId: z.string(),
    })
  )
);
export type MCPServerConnectedAccounts = z.infer<typeof MCPServerConnectedAccountsSchema>;
