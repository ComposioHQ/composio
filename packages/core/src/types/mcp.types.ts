import { CustomCreateResponse, McpCreateResponse, GenerateURLResponse } from '@composio/client/resources/mcp';
import { z } from 'zod';

/**
 * MCP Create Method Input Types
 */
export type MCPCreateConfig = {
  toolkits?: string[];
  tools?: string[];
};

export type MCPAuthOptions = {
  useManagedAuthByComposio?: boolean;
  authConfigIds?: string[];
};

export type MCPInstanceParams = {
  serverId: string;
  userIds?: string[];
  connectedAccountIds?: string[];
  useManagedAuthByComposio?: boolean;
};

export const MCPGenerateURLParamsSchema = z.object({
  userIds: z.array(z.string()).optional(),
  connectedAccountIds: z.array(z.string()).optional(),
  useManagedAuthByComposio: z.boolean().optional(),
});
export type MCPGenerateURLParams = z.infer<typeof MCPGenerateURLParamsSchema>;
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
 * Extends the API response with a get method for retrieving server instances
 */
export type MCPCreateMethodResponse = (McpCreateResponse | CustomCreateResponse) & {
  get: (
    params: { 
      userIds?: string[]; 
      connectedAccountIds?: string[]; 
    },
    authOptions?: MCPAuthOptions
  ) => Promise<GenerateURLResponse>;
};


