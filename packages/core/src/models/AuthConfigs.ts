/**
 * @fileoverview Auth configs class for Composio SDK, used to manage authentication configurations.
 *
 * @author Musthaq Ahamad <musthaq@composio.dev>
 * @date 2025-05-05
 * @module AuthConfigs
 */
import ComposioClient from '@composio/client';
import {
  AuthConfigRetrieveResponse as ComposioAuthConfigRetrieveResponse,
  AuthConfigDeleteResponse,
  AuthConfigUpdateResponse,
  AuthConfigUpdateStatusResponse,
} from '@composio/client/resources/auth-configs';
import {
  AuthConfigListParams,
  AuthConfigListParamsSchema,
  AuthConfigListResponse,
  AuthConfigListResponseSchema,
  AuthConfigRetrieveResponse,
  AuthConfigRetrieveResponseSchema,
  AuthConfigUpdateParams,
  AuthConfigUpdateParamsSchema,
  CreateAuthConfigParams,
  CreateAuthConfigParamsSchema,
  CreateAuthConfigResponse,
  CreateAuthConfigResponseSchema,
} from '../types/authConfigs.types';
import { ValidationError } from '../errors/ValidationErrors';
import { telemetry } from '../telemetry/Telemetry';
/**
 * AuthConfigs class
 *
 * This class is used to manage authentication configurations in the Composio SDK.
 * Auth configs are used to configure authentication providers and settings.
 */
export class AuthConfigs {
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
    telemetry.instrument(this);
  }

  /**
   * Protected getter for the client instance.
   * This is primarily used for testing purposes.
   * @protected
   */
  protected getClient(): ComposioClient {
    return this.client;
  }

  /**
   * Transforms an auth config response from API format to SDK format.
   *
   * This method converts property names from snake_case to camelCase and reorganizes
   * the data structure to match the SDK's standardized format for auth configurations.
   *
   * @param {ComposioAuthConfigRetrieveResponse} authConfig - The raw API response to transform
   * @returns {AuthConfigRetrieveResponse} The transformed auth config data
   * @throws {ValidationError} If the response fails validation against the expected schema
   *
   * @private
   */
  private parseAuthConfigRetrieveResponse(
    authConfig: ComposioAuthConfigRetrieveResponse
  ): AuthConfigRetrieveResponse {
    const result = AuthConfigRetrieveResponseSchema.safeParse({
      id: authConfig.id,
      name: authConfig.name,
      noOfConnections: authConfig.no_of_connections,
      status: authConfig.status,
      toolkit: {
        logo: authConfig.toolkit.logo,
        slug: authConfig.toolkit.slug,
      },
      uuid: authConfig.uuid,
      authScheme: authConfig.auth_scheme,
      credentials: authConfig.credentials,
      expectedInputFields: authConfig.expected_input_fields,
      isComposioManaged: authConfig.is_composio_managed,
      createdBy: authConfig.created_by,
      createdAt: authConfig.created_at,
      lastUpdatedAt: authConfig.last_updated_at,
    });
    if (result.error) {
      throw new ValidationError('Failed to parse auth config response', {
        cause: result.error,
      });
    }
    return result.data;
  }

  /**
   * Lists authentication configurations based on provided filter criteria.
   *
   * This method retrieves auth configs from the Composio API, transforms them to the SDK format,
   * and supports filtering by various parameters.
   *
   * @param {AuthConfigListParams} [query] - Optional query parameters for filtering auth configs
   * @returns {Promise<AuthConfigListResponse>} A paginated list of auth configurations
   * @throws {ValidationError} If the query parameters or response fail validation
   *
   * @example
   * ```typescript
   * // List all auth configs
   * const allConfigs = await composio.authConfigs.list();
   *
   * // List auth configs for a specific toolkit
   * const githubConfigs = await composio.authConfigs.list({
   *   toolkit: 'github'
   * });
   *
   * // List Composio-managed auth configs
   * const managedConfigs = await composio.authConfigs.list({
   *   isComposioManaged: true
   * });
   * ```
   */
  async list(query?: AuthConfigListParams): Promise<AuthConfigListResponse> {
    const parsedQuery = query ? AuthConfigListParamsSchema.parse(query) : undefined;
    const result = await this.client.authConfigs.list({
      cursor: parsedQuery?.cursor,
      is_composio_managed: parsedQuery?.isComposioManaged,
      limit: parsedQuery?.limit,
      toolkit_slug: parsedQuery?.toolkit,
    });
    const parsedResult = AuthConfigListResponseSchema.safeParse({
      items: result.items.map(item => this.parseAuthConfigRetrieveResponse(item)),
      nextCursor: result.next_cursor,
      totalPages: result.total_pages,
    });
    if (parsedResult.error) {
      throw new ValidationError('Failed to parse auth config list response', {
        cause: parsedResult.error,
      });
    }
    return parsedResult.data;
  }

  /**
   * Create a new auth config
   * @param {string} toolkit - Unique identifier of the toolkit
   * @param {CreateAuthConfigParams} options - Options for creating a new auth config
   * @returns {Promise<CreateAuthConfigResponse>} Created auth config
   *
   * @example
   * const authConfig = await authConfigs.create('my-toolkit', {
   *   type: AuthConfigTypes.CUSTOM,
   *   name: 'My Custom Auth Config',
   *   authScheme: AuthSchemeTypes.API_KEY,
   *   credentials: {
   *     apiKey: '1234567890',
   *   },
   * });
   *
   * @link https://docs.composio.dev/reference/auth-configs/create-auth-config
   */
  async create(
    toolkit: string,
    options: CreateAuthConfigParams = { type: 'use_composio_managed_auth' }
  ): Promise<CreateAuthConfigResponse> {
    const parsedOptions = CreateAuthConfigParamsSchema.safeParse(options);
    if (parsedOptions.error) {
      throw new ValidationError('Failed to parse auth config create options', {
        cause: parsedOptions.error,
      });
    }
    const result = await this.client.authConfigs.create({
      toolkit: {
        slug: toolkit,
      },
      auth_config: parsedOptions.data,
    });
    const parsedResult = CreateAuthConfigResponseSchema.safeParse({
      id: result.auth_config.id,
      authScheme: result.auth_config.auth_scheme,
      isComposioManaged: result.auth_config.is_composio_managed,
      toolkit: result.toolkit.slug,
    });
    if (parsedResult.error) {
      throw new ValidationError('Failed to parse auth config create response', {
        cause: parsedResult.error,
      });
    }
    return parsedResult.data;
  }

  /**
   * Retrieves a specific authentication configuration by its ID.
   *
   * This method fetches detailed information about a single auth config
   * and transforms the response to the SDK's standardized format.
   *
   * @param {string} nanoid - The unique identifier of the auth config to retrieve
   * @returns {Promise<AuthConfigRetrieveResponse>} The auth config details
   * @throws {Error} If the auth config cannot be found or an API error occurs
   * @throws {ValidationError} If the response fails validation
   *
   * @example
   * ```typescript
   * // Get an auth config by ID
   * const authConfig = await composio.authConfigs.get('auth_abc123');
   * console.log(authConfig.name); // e.g., 'GitHub Auth'
   * console.log(authConfig.toolkit.slug); // e.g., 'github'
   * ```
   */
  async get(nanoid: string): Promise<AuthConfigRetrieveResponse> {
    const result = await this.client.authConfigs.retrieve(nanoid);
    return this.parseAuthConfigRetrieveResponse(result);
  }

  /**
   * Updates an existing authentication configuration.
   *
   * This method allows you to modify properties of an auth config such as credentials,
   * scopes, or tool restrictions. The update type (custom or default) determines which
   * fields can be updated.
   *
   * @param {string} nanoid - The unique identifier of the auth config to update
   * @param {AuthConfigUpdateParams} data - The data to update, which can be either custom or default type
   * @returns {Promise<AuthConfigUpdateResponse>} The updated auth config
   * @throws {ValidationError} If the update parameters are invalid
   * @throws {Error} If the auth config cannot be found or updated
   *
   * @example
   * ```typescript
   * // Update a custom auth config with new credentials
   * const updatedConfig = await composio.authConfigs.update('auth_abc123', {
   *   type: 'custom',
   *   credentials: {
   *     apiKey: 'new-api-key-value'
   *   }
   * });
   *
   * // Update a default auth config with new scopes
   * const updatedConfig = await composio.authConfigs.update('auth_abc123', {
   *   type: 'default',
   *   scopes: ['read:user', 'repo']
   * });
   * ```
   */
  async update(nanoid: string, data: AuthConfigUpdateParams): Promise<AuthConfigUpdateResponse> {
    const parsedData = AuthConfigUpdateParamsSchema.safeParse(data);
    if (parsedData.error) {
      throw new ValidationError('Failed to parse auth config update data', {
        cause: parsedData.error,
      });
    }
    return this.client.authConfigs.update(
      nanoid,
      parsedData.data.type === 'custom'
        ? {
            type: 'custom',
            credentials: parsedData.data.credentials,
            restrict_to_following_tools: parsedData.data.restrictToFollowingTools,
          }
        : {
            type: 'default',
            scopes: parsedData.data.scopes,
            restrict_to_following_tools: parsedData.data.restrictToFollowingTools,
          }
    );
  }

  /**
   * Deletes an authentication configuration.
   *
   * This method permanently removes an auth config from the Composio platform.
   * This action cannot be undone and will prevent any connected accounts that use
   * this auth config from functioning.
   *
   * @param {string} nanoid - The unique identifier of the auth config to delete
   * @returns {Promise<AuthConfigDeleteResponse>} The deletion response
   * @throws {Error} If the auth config doesn't exist or cannot be deleted
   *
   * @example
   * ```typescript
   * // Delete an auth config
   * await composio.authConfigs.delete('auth_abc123');
   * ```
   */
  async delete(nanoid: string): Promise<AuthConfigDeleteResponse> {
    return this.client.authConfigs.delete(nanoid);
  }

  /**
   * Updates the status of an authentication configuration.
   *
   * This method allows you to enable or disable an auth config. When disabled,
   * the auth config cannot be used to create new connected accounts or authenticate
   * with third-party services.
   *
   * @param {string} status - The status to set ('ENABLED' or 'DISABLED')
   * @param {string} nanoid - The unique identifier of the auth config
   * @returns {Promise<AuthConfigUpdateStatusResponse>} The updated auth config details
   * @throws {Error} If the auth config cannot be found or the status cannot be updated
   *
   * @example
   * ```typescript
   * // Disable an auth config
   * await composio.authConfigs.updateStatus('DISABLED', 'auth_abc123');
   *
   * // Enable an auth config
   * await composio.authConfigs.updateStatus('ENABLED', 'auth_abc123');
   * ```
   */
  async updateStatus(
    status: 'ENABLED' | 'DISABLED',
    nanoid: string
  ): Promise<AuthConfigUpdateStatusResponse> {
    return this.client.authConfigs.updateStatus(status, { nanoid });
  }

  /**
   * Enables an authentication configuration.
   *
   * This is a convenience method that calls updateStatus with 'ENABLED'.
   * When enabled, the auth config can be used to create new connected accounts
   * and authenticate with third-party services.
   *
   * @param {string} nanoid - The unique identifier of the auth config to enable
   * @returns {Promise<AuthConfigUpdateStatusResponse>} The updated auth config details
   * @throws {Error} If the auth config cannot be found or enabled
   *
   * @example
   * ```typescript
   * // Enable an auth config
   * await composio.authConfigs.enable('auth_abc123');
   * ```
   */
  async enable(nanoid: string): Promise<AuthConfigUpdateStatusResponse> {
    return this.client.authConfigs.updateStatus('ENABLED', { nanoid });
  }

  /**
   * Disables an authentication configuration.
   *
   * This is a convenience method that calls updateStatus with 'DISABLED'.
   * When disabled, the auth config cannot be used to create new connected accounts
   * or authenticate with third-party services, but existing connections may continue to work.
   *
   * @param {string} nanoid - The unique identifier of the auth config to disable
   * @returns {Promise<AuthConfigUpdateStatusResponse>} The updated auth config details
   * @throws {Error} If the auth config cannot be found or disabled
   *
   * @example
   * ```typescript
   * // Disable an auth config
   * await composio.authConfigs.disable('auth_abc123');
   * ```
   */
  async disable(nanoid: string): Promise<AuthConfigUpdateStatusResponse> {
    return this.client.authConfigs.updateStatus('DISABLED', { nanoid });
  }
}
