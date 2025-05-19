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
  CreateAuthConfigParams,
  CreateAuthConfigParamsSchema,
  CreateAuthConfigResponse,
  CreateAuthConfigResponseSchema,
} from '../types/authConfigs.types';
import { ValidationError } from '../errors/ValidationError';

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
  }

  /**
   * Protected getter for the client instance.
   * This is primarily used for testing purposes.
   * @protected
   */
  protected getClient(): ComposioClient {
    return this.client;
  }

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
      throw new ValidationError(result.error);
    }
    return result.data;
  }

  /**
   * List all auth configs
   * @param {AuthConfigListParams} query - Query parameters for filtering auth configs
   * @param {RequestOptions} options - Request options
   * @returns {Promise<AuthConfigListResponse>} List of auth configs
   */
  async list(query?: AuthConfigListParams): Promise<AuthConfigListResponse> {
    const parsedQuery = query ? AuthConfigListParamsSchema.parse(query) : undefined;
    const result = await this.client.authConfigs.list({
      cursor: parsedQuery?.cursor,
      is_composio_managed: parsedQuery?.isComposioManaged,
      limit: parsedQuery?.limit?.toString(),
      toolkit_slug: parsedQuery?.toolkitSlug,
    });
    const parsedResult = AuthConfigListResponseSchema.safeParse({
      items: result.items.map(item => this.parseAuthConfigRetrieveResponse(item)),
      nextCursor: result.next_cursor,
      totalPages: result.total_pages,
    });
    if (parsedResult.error) {
      throw new ValidationError(parsedResult.error);
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
    options: CreateAuthConfigParams
  ): Promise<CreateAuthConfigResponse> {
    const parsedOptions = CreateAuthConfigParamsSchema.safeParse(options);
    if (parsedOptions.error) {
      throw new ValidationError(parsedOptions.error);
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
      throw new ValidationError(parsedResult.error);
    }
    return parsedResult.data;
  }

  /**
   * Get an auth config by nanoid
   * @param {string} nanoid - Unique identifier of the auth config
   * @param {RequestOptions} options - Request options
   * @returns {Promise<AuthConfigRetrieveResponse>} Auth config details
   */
  async get(nanoid: string): Promise<AuthConfigRetrieveResponse> {
    const result = await this.client.authConfigs.retrieve(nanoid);
    return this.parseAuthConfigRetrieveResponse(result);
  }

  /**
   * Update an auth config
   * @param {string} nanoid - Unique identifier of the auth config to update
   * @param {AuthConfigUpdateParams} data - Data to update
   * @param {RequestOptions} options - Request options
   * @returns {Promise<AuthConfigUpdateResponse>} Updated auth config
   */
  async update(nanoid: string, data: AuthConfigUpdateParams): Promise<AuthConfigUpdateResponse> {
    return this.client.authConfigs.update(nanoid, {
      auth_config: {
        credentials: data.credentials,
      },
    });
  }

  /**
   * Delete an auth config
   * @param {string} nanoid - Unique identifier of the auth config to delete
   * @param {RequestOptions} options - Request options
   * @returns {Promise<AuthConfigDeleteResponse>} Response from deletion
   */
  async delete(nanoid: string): Promise<AuthConfigDeleteResponse> {
    return this.client.authConfigs.delete(nanoid);
  }

  /**
   * Update the status of an auth config
   * @param {string} status - The status to update the auth config to
   * @param {string} nanoid - Unique identifier of the auth config
   * @param {RequestOptions} options - Request options
   * @returns {Promise<AuthConfigUpdateStatusResponse>} Updated auth config details
   */
  async updateStatus(
    status: 'ENABLED' | 'DISABLED',
    nanoid: string
  ): Promise<AuthConfigUpdateStatusResponse> {
    return this.client.authConfigs.updateStatus(status, { nanoid });
  }

  /**
   * Enable an auth config
   * @param {string} nanoid - Unique identifier of the auth config
   * @param {RequestOptions} options - Request options
   * @returns {Promise<AuthConfigUpdateStatusResponse>} Updated auth config details
   */
  async enable(nanoid: string): Promise<AuthConfigUpdateStatusResponse> {
    return this.client.authConfigs.updateStatus('ENABLED', { nanoid });
  }

  /**
   * Disable an auth config
   * @param {string} nanoid - Unique identifier of the auth config
   * @param {RequestOptions} options - Request options
   * @returns {Promise<AuthConfigUpdateStatusResponse>} Updated auth config details
   */
  async disable(nanoid: string): Promise<AuthConfigUpdateStatusResponse> {
    return this.client.authConfigs.updateStatus('DISABLED', { nanoid });
  }
}
