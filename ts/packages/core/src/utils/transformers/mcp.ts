import { ValidationError } from '../../errors/ValidationErrors';
import {
  CustomCreateResponseSchema,
  McpListResponseSchema,
  McpRetrieveResponseSchema,
  McpDeleteResponseSchema,
  McpUpdateResponseSchema,
  CustomCreateResponse,
  McpListResponse,
  McpRetrieveResponse,
  McpDeleteResponse,
  McpUpdateResponse,
  GenerateURLResponse,
  GenerateURLResponseSchema,
} from '../../types/mcp.types';
import {
  CustomCreateResponse as CustomCreateResponseRaw,
  GenerateURLResponse as GenerateURLResponseRaw,
  McpListResponse as McpListResponseRaw,
  McpCreateResponse as McpCreateResponseRaw,
  McpDeleteResponse as McpDeleteResponseRaw,
  McpUpdateResponse as McpUpdateResponseRaw,
} from '@composio/client/resources/mcp';

/**
 * Transform MCP create response from snake_case to camelCase
 */
export function transformMcpCreateResponse(
  response: CustomCreateResponseRaw
): CustomCreateResponse {
  const result = CustomCreateResponseSchema.safeParse({
    id: response.id,
    name: response.name,
    createdAt: (response as unknown as Record<string, unknown>).created_at,
    updatedAt: (response as unknown as Record<string, unknown>).updated_at,
    status: (response as unknown as Record<string, unknown>).status,
  });

  if (!result.success) {
    throw new ValidationError('Failed to parse MCP create response', {
      cause: result.error,
    });
  }

  return result.data;
}

/**
 * Transform MCP list response from snake_case to camelCase
 */
export function transformMcpListResponse(response: McpListResponseRaw): McpListResponse {
  const transformedItems = response.items?.map(item => ({
    id: item.id,
    name: item.name,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    status: (item as unknown as Record<string, unknown>).status,
  }));

  const result = McpListResponseSchema.safeParse({
    items: transformedItems,
  });

  if (!result.success) {
    throw new ValidationError('Failed to parse MCP list response', {
      cause: result.error,
    });
  }

  return result.data;
}

/**
 * Transform MCP retrieve response from snake_case to camelCase
 */
export function transformMcpRetrieveResponse(response: McpCreateResponseRaw): McpRetrieveResponse {
  const result = McpRetrieveResponseSchema.safeParse({
    id: response.id,
    name: response.name,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
    status: (response as unknown as Record<string, unknown>).status,
    toolkits: response.toolkits,
    tools: (response as unknown as Record<string, unknown>).tools,
    managedAuthViaComposio: response.managed_auth_via_composio,
  });

  if (!result.success) {
    throw new ValidationError('Failed to parse MCP retrieve response', {
      cause: result.error,
    });
  }

  return result.data;
}

/**
 * Transform MCP delete response from snake_case to camelCase
 */
export function transformMcpDeleteResponse(response: McpDeleteResponseRaw): McpDeleteResponse {
  const result = McpDeleteResponseSchema.safeParse({
    id: (response as unknown as Record<string, unknown>).id,
    deleted: (response as unknown as Record<string, unknown>).deleted,
    message: (response as unknown as Record<string, unknown>).message,
  });

  if (!result.success) {
    throw new ValidationError('Failed to parse MCP delete response', {
      cause: result.error,
    });
  }

  return result.data;
}

/**
 * Transform MCP update response from snake_case to camelCase
 */
export function transformMcpUpdateResponse(response: McpUpdateResponseRaw): McpUpdateResponse {
  const result = McpUpdateResponseSchema.safeParse({
    id: response.id,
    name: response.name,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
    status: (response as unknown as Record<string, unknown>).status,
    toolkits: response.toolkits,
    tools: (response as unknown as Record<string, unknown>).tools,
  });

  if (!result.success) {
    throw new ValidationError('Failed to parse MCP update response', {
      cause: result.error,
    });
  }

  return result.data;
}

/**
 * Transform MCP generate URL response from snake_case to camelCase
 */
export function transformMcpGenerateUrlResponse(
  response: GenerateURLResponseRaw
): GenerateURLResponse {
  const result = GenerateURLResponseSchema.safeParse({
    connectedAccountUrls: response.connected_account_urls,
    userIdsUrl: response.user_ids_url,
    mcpUrl: response.mcp_url,
  });

  if (!result.success) {
    throw new ValidationError('Failed to parse MCP generate URL response', {
      cause: result.error,
    });
  }

  return result.data;
}
