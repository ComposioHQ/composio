/**
 * @fileoverview Auth configs class for Composio SDK, used to manage authentication configurations.
 *
 * @author Musthaq Ahamad <musthaq@composio.dev>
 * @date 2025-05-05
 * @module AuthConfigs
 */
import ComposioClient from '@composio/client';
import { RequestOptions } from '@composio/client/internal/request-options';
import {
  AuthConfigListParams,
  AuthConfigListResponse,
  AuthConfigCreateParams,
  AuthConfigCreateResponse,
  AuthConfigDeleteResponse,
  AuthConfigRetrieveResponse,
  AuthConfigUpdateParams,
  AuthConfigUpdateResponse,
  AuthConfigUpdateStatusResponse,
} from '@composio/client/resources/auth-configs';

/**
 * AuthConfigs class
 *
 * This class is used to manage authentication configurations in the Composio SDK.
 * Auth configs are used to configure authentication providers and settings.
 */
export class AuthConfigs {
  readonly FILE_NAME: string = 'core/models/AuthConfigs.ts';
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
  }

  /**
   * List all auth configs
   * @param {AuthConfigListParams} query - Query parameters for filtering auth configs
   * @param {RequestOptions} options - Request options
   * @returns {Promise<AuthConfigListResponse>} List of auth configs
   */
  async list(
    query?: AuthConfigListParams,
    options?: RequestOptions
  ): Promise<AuthConfigListResponse> {
    return this.client.authConfigs.list(query, options);
  }

  /**
   * Create a new auth config
   * @param {AuthConfigCreateParams} data - Data for creating a new auth config
   * @param {RequestOptions} options - Request options
   * @returns {Promise<AuthConfigCreateResponse>} Created auth config
   */
  async create(
    data: AuthConfigCreateParams,
    options?: RequestOptions
  ): Promise<AuthConfigCreateResponse> {
    return this.client.authConfigs.create(data, options);
  }

  /**
   * Get an auth config by nanoid
   * @param {string} nanoid - Unique identifier of the auth config
   * @param {RequestOptions} options - Request options
   * @returns {Promise<AuthConfigRetrieveResponse>} Auth config details
   */
  async get(nanoid: string, options?: RequestOptions): Promise<AuthConfigRetrieveResponse> {
    return this.client.authConfigs.retrieve(nanoid, options);
  }

  /**
   * Update an auth config
   * @param {string} nanoid - Unique identifier of the auth config to update
   * @param {AuthConfigUpdateParams} data - Data to update
   * @param {RequestOptions} options - Request options
   * @returns {Promise<AuthConfigUpdateResponse>} Updated auth config
   */
  async update(
    nanoid: string,
    data: AuthConfigUpdateParams,
    options?: RequestOptions
  ): Promise<AuthConfigUpdateResponse> {
    return this.client.authConfigs.update(nanoid, data, options);
  }

  /**
   * Delete an auth config
   * @param {string} nanoid - Unique identifier of the auth config to delete
   * @param {RequestOptions} options - Request options
   * @returns {Promise<AuthConfigDeleteResponse>} Response from deletion
   */
  async delete(nanoid: string, options?: RequestOptions): Promise<AuthConfigDeleteResponse> {
    return this.client.authConfigs.delete(nanoid, options);
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
    nanoid: string,
    options?: RequestOptions
  ): Promise<AuthConfigUpdateStatusResponse> {
    return this.client.authConfigs.updateStatus(status, { nanoid }, options);
  }

  /**
   * Enable an auth config
   * @param {string} nanoid - Unique identifier of the auth config
   * @param {RequestOptions} options - Request options
   * @returns {Promise<AuthConfigUpdateStatusResponse>} Updated auth config details
   */
  async enable(nanoid: string, options?: RequestOptions): Promise<AuthConfigUpdateStatusResponse> {
    return this.client.authConfigs.updateStatus('ENABLED', { nanoid }, options);
  }

  /**
   * Disable an auth config
   * @param {string} nanoid - Unique identifier of the auth config
   * @param {RequestOptions} options - Request options
   * @returns {Promise<AuthConfigUpdateStatusResponse>} Updated auth config details
   */
  async disable(nanoid: string, options?: RequestOptions): Promise<AuthConfigUpdateStatusResponse> {
    return this.client.authConfigs.updateStatus('DISABLED', { nanoid }, options);
  }
}
