import { logger } from '../..';
import {
  AuthConfigRetrieveResponse,
  AuthConfigRetrieveResponseSchema,
  AuthConfigListResponse,
  AuthConfigListResponseSchema,
  CreateAuthConfigResponse,
  CreateAuthConfigResponseSchema,
} from '../../types/authConfigs.types';

import {
  AuthConfigListResponse as RawAuthConfigListResponse,
  AuthConfigRetrieveResponse as RawAuthConfigRetrieveResponse,
  AuthConfigCreateResponse as RawCreateAuthConfigResponse,
} from '@composio/client/resources/auth-configs';
import { transform } from '../transform';

/**
 * Transforms an auth config response from API format to SDK format.
 *
 * This method converts property names from snake_case to camelCase and reorganizes
 * the data structure to match the SDK's standardized format for auth configurations.
 *
 * @param {RawAuthConfigRetrieveResponse} authConfig - The raw API response to transform
 * @returns {AuthConfigRetrieveResponse} The transformed auth config data
 *
 * @private
 */
export function transformAuthConfigRetrieveResponse(
  authConfig: RawAuthConfigRetrieveResponse
): AuthConfigRetrieveResponse {
  return transform(authConfig)
    .with(AuthConfigRetrieveResponseSchema)
    .using(authConfig => ({
      id: authConfig.id,
      name: authConfig.name,
      noOfConnections: authConfig.no_of_connections,
      status: authConfig.status,
      toolkit: {
        logo: authConfig.toolkit.logo,
        slug: authConfig.toolkit.slug,
      },
      isEnabledForToolRouter: authConfig.is_enabled_for_tool_router,
      uuid: authConfig.uuid,
      authScheme: authConfig.auth_scheme,
      credentials: authConfig.credentials,
      expectedInputFields: authConfig.expected_input_fields,
      isComposioManaged: authConfig.is_composio_managed,
      createdBy: authConfig.created_by,
      createdAt: authConfig.created_at,
      lastUpdatedAt: authConfig.last_updated_at,
      restrictToFollowingTools: authConfig.tool_access_config?.tools_for_connected_account_creation,
      toolAccessConfig: authConfig.tool_access_config
        ? {
            toolsAvailableForExecution: authConfig.tool_access_config.tools_available_for_execution,
            toolsForConnectedAccountCreation:
              authConfig.tool_access_config.tools_for_connected_account_creation,
          }
        : undefined,
    }));
}

/**
 * Transforms the raw auth config list response from the Composio API to the SDK format.
 *
 * This method converts property names from snake_case to camelCase and reorganizes
 * the data structure to match the SDK's standardized format for auth configurations.
 *
 * @param {RawAuthConfigListResponse} response - The raw API response to transform
 * @returns {AuthConfigListResponse} The transformed response
 *
 * @private
 */
export function transformAuthConfigListResponse(
  response: RawAuthConfigListResponse
): AuthConfigListResponse {
  return transform(response)
    .with(AuthConfigListResponseSchema)
    .using(response => ({
      items: response.items.map(transformAuthConfigRetrieveResponse),
      nextCursor: response.next_cursor ?? null,
      totalPages: response.total_pages,
    }));
}

/**
 * Transforms the raw create auth config response from the Composio API to the SDK format.
 *
 * This method converts property names from snake_case to camelCase and reorganizes
 * the data structure to match the SDK's standardized format for auth configurations.
 *
 * @param {RawCreateAuthConfigResponse} response - The raw API response to transform
 * @returns {CreateAuthConfigResponse} The transformed response
 *
 * @private
 */
export function transformCreateAuthConfigResponse(
  response: RawCreateAuthConfigResponse
): CreateAuthConfigResponse {
  return transform(response)
    .with(CreateAuthConfigResponseSchema)
    .using(response => ({
      id: response.auth_config.id,
      authScheme: response.auth_config.auth_scheme,
      isComposioManaged: response.auth_config.is_composio_managed,
      toolkit: response.toolkit.slug,
    }));
}
