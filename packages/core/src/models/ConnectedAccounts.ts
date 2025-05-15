/**
 * @fileoverview Connected accounts class for Composio SDK, used to manage connected accounts of a user.
 *
 * @author Musthaq Ahamad <musthaq@composio.dev>
 * @date 2025-05-05
 * @module ConnectedAccounts
 */
import ComposioClient from '@composio/client';
import { RequestOptions } from '@composio/client/internal/request-options';
import {
  ConnectedAccountListParams,
  ConnectedAccountListResponse,
  ConnectedAccountCreateParams,
  ConnectedAccountCreateResponse,
  ConnectedAccountDeleteResponse,
  ConnectedAccountRetrieveResponse,
  ConnectedAccountRefreshResponse,
  ConnectedAccountUpdateStatusParams,
  ConnectedAccountUpdateStatusResponse,
} from '@composio/client/resources/connected-accounts';
import {
  CreateConnectedAccountOptions,
  CreateConnectedAccountParamsSchema,
} from '../types/connectedAccounts.types';
import { ConnectionRequest } from './ConnectionRequest';

/**
 * ConnectedAccounts class
 *
 * This class is used to manage connected accounts in the Composio SDK.
 * Connected accounts are used to authenticate with third-party services.
 */
export class ConnectedAccounts {
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
  }

  /**
   * List all connected accounts
   * @param {ConnectedAccountListParams} query - Query parameters for filtering connected accounts
   * @param {RequestOptions} options - Request options
   * @returns {Promise<ConnectedAccountListResponse>} List of connected accounts
   */
  async list(
    query?: ConnectedAccountListParams,
    options?: RequestOptions
  ): Promise<ConnectedAccountListResponse> {
    return this.client.connectedAccounts.list(query, options);
  }

  /**
   * Create a new connected account
   * @param {ConnectedAccountCreateParams} data - Data for creating a new connected account
   * @param {RequestOptions} options - Request options
   * @returns {Promise<ConnectedAccountCreateResponse>} Created connected account
   */
  async create(
    data: ConnectedAccountCreateParams,
    options?: RequestOptions
  ): Promise<ConnectedAccountCreateResponse> {
    return this.client.connectedAccounts.create(data, options);
  }

  /**
   * Get a connected account by nanoid
   * @param {string} nanoid - Unique identifier of the connected account
   * @param {RequestOptions} options - Request options
   * @returns {Promise<ConnectedAccountRetrieveResponse>} Connected account details
   */
  async get(nanoid: string): Promise<ConnectedAccountRetrieveResponse> {
    return this.client.connectedAccounts.retrieve(nanoid);
  }

  /**
   * Delete a connected account
   * @param {string} nanoid - Unique identifier of the connected account to delete
   * @param {RequestOptions} options - Request options
   * @returns {Promise<ConnectedAccountDeleteResponse>} Response from deletion
   */
  async delete(nanoid: string): Promise<ConnectedAccountDeleteResponse> {
    return this.client.connectedAccounts.delete(nanoid);
  }

  /**
   * Refresh a connected account's credentials
   * @param {string} nanoid - Unique identifier of the connected account to refresh
   * @param {RequestOptions} options - Request options
   * @returns {Promise<ConnectedAccountRefreshResponse>} Refreshed connected account details
   */
  async refresh(
    nanoid: string,
    options?: RequestOptions
  ): Promise<ConnectedAccountRefreshResponse> {
    return this.client.connectedAccounts.refresh(nanoid);
  }

  /**
   * Update the status of a connected account
   * @param {string} nanoid - Unique identifier of the connected account
   * @param {ConnectedAccountUpdateStatusParams} params - Parameters for updating the status
   * @param {RequestOptions} options - Request options
   * @returns {Promise<ConnectedAccountUpdateStatusResponse>} Updated connected account details
   */
  async updateStatus(
    nanoid: string,
    params: ConnectedAccountUpdateStatusParams,
    options?: RequestOptions
  ): Promise<ConnectedAccountUpdateStatusResponse> {
    return this.client.connectedAccounts.updateStatus(nanoid, params);
  }

  /**
   * Enable a connected account
   * @param {string} nanoid - Unique identifier of the connected account
   * @param {RequestOptions} options - Request options
   * @returns {Promise<ConnectedAccountUpdateStatusResponse>} Updated connected account details
   */
  async enable(
    nanoid: string,
    options?: RequestOptions
  ): Promise<ConnectedAccountUpdateStatusResponse> {
    return this.client.connectedAccounts.updateStatus(nanoid, { enabled: true });
  }

  /**
   * Disable a connected account
   * @param {string} nanoid - Unique identifier of the connected account
   * @param {RequestOptions} options - Request options
   * @returns {Promise<ConnectedAccountUpdateStatusResponse>} Updated connected account details
   */
  async disable(
    nanoid: string,
    options?: RequestOptions
  ): Promise<ConnectedAccountUpdateStatusResponse> {
    return this.client.connectedAccounts.updateStatus(nanoid, { enabled: false });
  }

  /**
   * Compound function to create a new connected account.
   * This function creates a new connected account and returns a connection request.
   * Users can then wait for the connection to be established using the `waitForConnection` method.
   * @param {CreateConnectedAccountParams} data - Data for creating a new connected account
   * @returns {Promise<ConnectionRequest>} Connection request object
   */
  async createConnectedAccount(
    userId: string,
    authConfigId: string,
    options: CreateConnectedAccountOptions
  ): Promise<ConnectionRequest> {
    const { redirectUrl, data } = options;
    const response = await this.create({
      auth_config: {
        id: authConfigId,
      },
      connection: {
        data: data,
        redirect_uri: redirectUrl,
        user_id: userId,
      },
    });
    return new ConnectionRequest(this.client, response.id, response.status);
  }
}
