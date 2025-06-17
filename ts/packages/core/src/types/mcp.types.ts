import {
  CustomCreateResponse,
  McpCreateResponse,
  GenerateURLResponse,
} from '@composio/client/resources/mcp';
import { z } from 'zod';

/**
 * MCP Create Method Input Types
 */
export const MCPToolkitConfigSchema = z.object({
  toolkit: z.string().min(1, 'Toolkit name cannot be empty'),
  authConfigId: z.string().min(1, 'Auth config ID cannot be empty'),
  allowedTools: z
    .array(z.string().min(1, 'Tool name cannot be empty'))
    .min(1, 'At least one tool must be specified'),
});

export type MCPToolkitConfig = z.infer<typeof MCPToolkitConfigSchema>;

export const MCPToolkitConfigsArraySchema = z
  .array(MCPToolkitConfigSchema)
  .min(1, 'At least one toolkit configuration is required')
  .refine(configs => {
    const toolkits = configs.map(config => config.toolkit);
    const uniqueToolkits = new Set(toolkits);
    return uniqueToolkits.size === toolkits.length;
  }, 'Duplicate toolkits are not allowed. Each toolkit must be unique.');

export const MCPAuthOptionsSchema = z.object({
  useComposioManagedAuth: z.boolean().optional(),
});

export type MCPAuthOptions = z.infer<typeof MCPAuthOptionsSchema>;

export const MCPGetServerParamsSchema = z
  .object({
    userId: z.string().min(1, 'User ID cannot be empty').optional(),
    connectedAccountIds: z
      .record(z.string(), z.string().min(1, 'Account ID cannot be empty'))
      .optional(),
  })
  .refine(
    data => {
      // Ensure exactly one of userId or connectedAccountIds is provided
      const hasUserId = !!data.userId;
      const hasConnectedAccountIds =
        !!data.connectedAccountIds && Object.keys(data.connectedAccountIds).length > 0;
      return hasUserId !== hasConnectedAccountIds; // XOR: exactly one should be true
    },
    {
      message: 'Must provide either userId or connectedAccountIds, but not both',
    }
  );

export type MCPGetServerParams = z.infer<typeof MCPGetServerParamsSchema>;

export type MCPInstanceParams = {
  serverId: string;
  userIds?: string[];
  connectedAccountIds?: string[];
  useComposioManagedAuth?: boolean;
};

export const MCPGenerateURLParamsSchema = z.object({
  userIds: z.array(z.string()).optional(),
  connectedAccountIds: z.array(z.string()).optional(),
  useComposioManagedAuth: z.boolean().optional(),
});
export type MCPGenerateURLParams = z.infer<typeof MCPGenerateURLParamsSchema>;

export const GenerateURLResponseSchema = z.object({
  connected_account_urls: z.array(z.string()).optional(),
  user_ids_url: z.array(z.string()).optional(),
  mcp_url: z.string().min(1, 'MCP URL cannot be empty'),
});

export type GenerateURLResponseValidated = z.infer<typeof GenerateURLResponseSchema>;

/**
 * MCP Server Type (Single App)
 */
export const MCPSingleAppServerSchema = z.object({
  name: z.string().describe('Name of the MCP server'),
  tools: z.array(z.string()).describe('List of allowed tools'),
  authConfigId: z.string().optional().describe('Auth config ID for the server'),
});
export type MCPSingleAppServer = z.infer<typeof MCPSingleAppServerSchema>;

/**
 * MCP Server Type (Multi App)
 */
export const MCPMultiAppServerSchema = z.object({
  name: z.string().describe('Name of the MCP server'),
  tools: z.array(z.string()).describe('List of allowed tools across toolkits'),
  toolkits: z.array(z.string()).describe('List of allowed toolkits'),
});
export type MCPMultiAppServer = z.infer<typeof MCPMultiAppServerSchema>;

/**
 * MCP Server Type (Combined)
 */
export const MCPServerSchema = z.object({
  id: z.string().describe('Unique identifier for the MCP server'),
  type: z.enum(['single', 'multi']).describe('Type of MCP server'),
  createdAt: z.string().describe('Creation timestamp'),
  updatedAt: z.string().describe('Last update timestamp'),
  status: z.enum(['active', 'inactive', 'error']).default('active'),
  config: z.union([MCPSingleAppServerSchema, MCPMultiAppServerSchema]),
});
export type MCPServer = z.infer<typeof MCPServerSchema>;

/**
 * MCP Server List Response
 */
export const MCPServerListResponseSchema = z.object({
  items: z.array(MCPServerSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type MCPServerListResponse = z.infer<typeof MCPServerListResponseSchema>;

/**
 * MCP Server Update Parameters
 */
export const MCPServerUpdateParamsSchema = z.object({
  name: z.string().optional().describe('New name for the server'),
  toolkits: z.array(z.string()).optional().describe('Updated list of toolkits'),
  allowedTools: z.array(z.string()).optional().describe('Updated list of allowed tools'),
});
export type MCPServerUpdateParams = z.infer<typeof MCPServerUpdateParamsSchema>;

/**
 * MCP Server Create Response
 */
export const MCPServerCreateResponseSchema = MCPServerSchema;
export type MCPServerCreateResponse = z.infer<typeof MCPServerCreateResponseSchema>;

/**
 * MCP Create Method Response Type
 * Extends the API response with a getServer method for retrieving server instances
 */
export type MCPCreateMethodResponse<T = GenerateURLResponse> = (
  | McpCreateResponse
  | CustomCreateResponse
) & {
  toolkits: string[];
  getServer: (params: MCPGetServerParams) => Promise<T>;
};

/**
 * MCP Server URL Information
 */
export type McpServerUrlInfo = {
  url: URL;
  name: string;
  toolkit?: string;
};

export type McpServerGetResponse = McpServerUrlInfo | McpServerUrlInfo[];

export type McpUrlResponse = {
  connected_account_urls?: string[];
  user_ids_url?: string[];
  mcp_url: string;
};

export type McpServerCreateResponse<T> = (McpCreateResponse | CustomCreateResponse) & {
  toolkits: string[];
  getServer: (params: MCPGetServerParams) => Promise<T>;
};

export const CustomCreateResponseSchema = z.object({
  id: z.string().min(1, 'Server ID cannot be empty'),
  name: z.string().min(1, 'Server name cannot be empty'),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  status: z.string().optional(),
});

export type CustomCreateResponseValidated = z.infer<typeof CustomCreateResponseSchema>;

export const McpListResponseSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1, 'Server ID cannot be empty'),
        name: z.string().min(1, 'Server name cannot be empty'),
        created_at: z.string().optional(),
        updated_at: z.string().optional(),
        status: z.string().optional(),
      })
    )
    .optional(),
});

export const McpRetrieveResponseSchema = z.object({
  id: z.string().min(1, 'Server ID cannot be empty'),
  name: z.string().min(1, 'Server name cannot be empty'),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  status: z.string().optional(),
  toolkits: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
});

export const McpDeleteResponseSchema = z.object({
  id: z.string().min(1, 'Server ID cannot be empty'),
  deleted: z.boolean().optional(),
  message: z.string().optional(),
});

export const McpUpdateResponseSchema = z.object({
  id: z.string().min(1, 'Server ID cannot be empty'),
  name: z.string().min(1, 'Server name cannot be empty'),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  status: z.string().optional(),
  toolkits: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
});
