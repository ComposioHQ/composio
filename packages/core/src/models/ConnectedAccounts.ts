/**
 * @fileoverview Connected accounts class for Composio SDK, used to manage connected accounts of a user.
 *
 * @author Musthaq Ahamad <musthaq@composio.dev>
 * @date 2025-05-05
 * @module ConnectedAccounts
 */
import ComposioClient from '@composio/client';
import {
  ConnectedAccountListParams,
  ConnectedAccountListResponse,
  ConnectedAccountDeleteResponse,
  ConnectedAccountRefreshResponse,
  ConnectedAccountUpdateStatusParams,
  ConnectedAccountUpdateStatusResponse,
  ConnectedAccountRetrieveResponse as ConnectedAccountRetrieveResponseRaw,
} from '@composio/client/resources/connected-accounts';
import {
  CreateConnectedAccountOptions,
  ConnectedAccountRetrieveResponse,
  ConnectedAccountRetrieveResponseSchema,
} from '../types/connectedAccounts.types';
import { ConnectionRequest } from './ConnectionRequest';
import { ValidationError } from '../errors/ValidationError';

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
  async list(query?: ConnectedAccountListParams): Promise<ConnectedAccountListResponse> {
    return this.client.connectedAccounts.list(query);
  }

  /**
   * Transform the raw response from the API to the expected format
   * @param {ConnectedAccountRetrieveResponseRaw} response - Raw response from the API
   * @returns {ConnectedAccountRetrieveResponse} Transformed response
   */
  transformConnectedAccountResponse(
    response: ConnectedAccountRetrieveResponseRaw
  ): ConnectedAccountRetrieveResponse {
    const result = ConnectedAccountRetrieveResponseSchema.safeParse({
      ...response,
      userId: response.user_id, // Add the missing userId property
      authConfig: {
        ...response.auth_config,
        authScheme: response.auth_config.auth_scheme,
        isComposioManaged: response.auth_config.is_composio_managed,
        isDisabled: response.auth_config.is_disabled,
      },
      statusReason: response.status_reason,
      isDisabled: response.is_disabled,
      createdAt: response.created_at,
      updatedAt: response.updated_at,
      testRequestEndpoint: response.test_request_endpoint,
    });
    if (result.error) {
      throw new ValidationError(result.error);
    }
    return result.data;
  }

  /**
   * Compound function to create a new connected account.
   * This function creates a new connected account and returns a connection request.
   * Users can then wait for the connection to be established using the `waitForConnection` method.
   * @param {string} userId - User ID of the connected account
   * @param {string} authConfigId - Auth config ID of the connected account
   * @param {CreateConnectedAccountOptions} data - Data for creating a new connected account
   * @returns {Promise<ConnectionRequest>} Connection request object
   *
   * @example
   * const connectionRequest = await composio.createConnectedAccount('user_123', 'auth_config_123', {
   *   data: {
   *     name: 'My Connected Account',
   *   },
   * });
   *
   * @link https://docs.composio.dev/reference/connected-accounts/create-connected-account
   */
  async initiate(
    userId: string,
    authConfigId: string,
    options?: CreateConnectedAccountOptions
  ): Promise<ConnectionRequest> {
    const response = await this.client.connectedAccounts.create({
      auth_config: {
        id: authConfigId,
      },
      connection: {
        data: options?.data,
        redirect_uri: options?.redirectUrl,
        user_id: userId,
      },
    });
    return new ConnectionRequest(this.client, response.id, response.status, response.redirect_uri);
  }

  async waitForConnection(
    connectedAccountId: string,
    timeout: number = 60000
  ): Promise<ConnectedAccountRetrieveResponse> {
    const connectionRequest = new ConnectionRequest(this.client, connectedAccountId);
    return connectionRequest.waitForConnection(timeout);
  }

  /**
   * Get a connected account by nanoid
   * @param {string} nanoid - Unique identifier of the connected account
   * @param {RequestOptions} options - Request options
   * @returns {Promise<ConnectedAccountRetrieveResponse>} Connected account details
   */
  async get(nanoid: string): Promise<ConnectedAccountRetrieveResponse> {
    const response = await this.client.connectedAccounts.retrieve(nanoid);
    return this.transformConnectedAccountResponse(response);
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
  async refresh(nanoid: string): Promise<ConnectedAccountRefreshResponse> {
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
    params: ConnectedAccountUpdateStatusParams
  ): Promise<ConnectedAccountUpdateStatusResponse> {
    return this.client.connectedAccounts.updateStatus(nanoid, params);
  }

  /**
   * Enable a connected account
   * @param {string} nanoid - Unique identifier of the connected account
   * @param {RequestOptions} options - Request options
   * @returns {Promise<ConnectedAccountUpdateStatusResponse>} Updated connected account details
   */
  async enable(nanoid: string): Promise<ConnectedAccountUpdateStatusResponse> {
    return this.client.connectedAccounts.updateStatus(nanoid, { enabled: true });
  }

  /**
   * Disable a connected account
   * @param {string} nanoid - Unique identifier of the connected account
   * @param {RequestOptions} options - Request options
   * @returns {Promise<ConnectedAccountUpdateStatusResponse>} Updated connected account details
   */
  async disable(nanoid: string): Promise<ConnectedAccountUpdateStatusResponse> {
    return this.client.connectedAccounts.updateStatus(nanoid, { enabled: false });
  }
}
