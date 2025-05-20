/**
 * @fileoverview Connected accounts class for Composio SDK, used to manage connected accounts of a user.
 *
 * @author Musthaq Ahamad <musthaq@composio.dev>
 * @date 2025-05-05
 * @module ConnectedAccounts
 */
import ComposioClient from '@composio/client';
import {
  ConnectedAccountDeleteResponse,
  ConnectedAccountRefreshResponse,
  ConnectedAccountUpdateStatusParams,
  ConnectedAccountUpdateStatusResponse,
  ConnectedAccountListParams as ConnectedAccountListParamsRaw,
  ConnectedAccountRetrieveResponse as ConnectedAccountRetrieveResponseRaw,
  ConnectedAccountListResponse as ConnectedAccountListResponseRaw,
} from '@composio/client/resources/connected-accounts';
import {
  CreateConnectedAccountOptions,
  ConnectedAccountRetrieveResponse,
  ConnectedAccountRetrieveResponseSchema,
  ConnectedAccountListParams,
  ConnectedAccountListParamsSchema,
  ConnectedAccountListResponse,
  ConnectedAccountListResponseSchema,
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

  transformConnectedAccountRetrieveResponse(
    response: ConnectedAccountRetrieveResponseRaw | ConnectedAccountListResponseRaw['items'][0]
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
    if (!result.success) {
      throw new ValidationError(result.error);
    }
    return result.data;
  }

  /**
   * Lists all connected accounts based on provided filter criteria.
   *
   * This method retrieves connected accounts from the Composio API with optional filtering.
   *
   * @param {ConnectedAccountListParams} [query] - Optional query parameters for filtering connected accounts
   * @returns {Promise<ConnectedAccountListResponse>} A paginated list of connected accounts
   * @throws {ValidationError} If the query fails validation against the expected schema
   * @example
   * ```typescript
   * // List all connected accounts
   * const allAccounts = await composio.connectedAccounts.list();
   *
   * // List accounts for a specific user
   * const userAccounts = await composio.connectedAccounts.list({
   *   userIds: ['user123']
   * });
   *
   * // List accounts for a specific toolkit
   * const githubAccounts = await composio.connectedAccounts.list({
   *   toolkitSlugs: ['github']
   * });
   * ```
   */
  async list(query?: ConnectedAccountListParams): Promise<ConnectedAccountListResponse> {
    let rawQuery: ConnectedAccountListParamsRaw | undefined = undefined;

    if (query) {
      const parsedQuery = ConnectedAccountListParamsSchema.safeParse(query);
      if (!parsedQuery.success) {
        throw new ValidationError(parsedQuery.error);
      }
      rawQuery = {
        auth_config_ids: parsedQuery.data.authConfigIds,
        cursor: parsedQuery.data.cursor,
        labels: parsedQuery.data.labels,
        limit: parsedQuery.data.limit,
        order_by: parsedQuery.data.orderBy,
        statuses: parsedQuery.data.statuses,
        toolkit_slugs: parsedQuery.data.toolkitSlugs,
        user_ids: parsedQuery.data.userIds,
      };
    }

    const result = await this.client.connectedAccounts.list(rawQuery);

    const parsedResponse = ConnectedAccountListResponseSchema.safeParse({
      items: result.items.map(this.transformConnectedAccountRetrieveResponse),
      nextCursor: result.next_cursor,
      totalPages: result.total_pages,
    });
    if (!parsedResponse.success) {
      throw new ValidationError(parsedResponse.error);
    }
    return parsedResponse.data;
  }

  /**
   * Transforms connected account data from API format to SDK format.
   *
   * This method converts property names from snake_case to camelCase and reorganizes
   * the data structure to match the SDK's standardized format for connected accounts.
   *
   * @param {ConnectedAccountRetrieveResponseRaw} response - The raw API response to transform
   * @returns {ConnectedAccountRetrieveResponse} The transformed connected account data
   * @throws {ValidationError} If the response fails validation against the expected schema
   *
   * @private
   */
  transformConnectedAccountResponse(
    response: ConnectedAccountRetrieveResponseRaw
  ): ConnectedAccountRetrieveResponse {
    return this.transformConnectedAccountRetrieveResponse(response);
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

  /**
   * Waits for a connection request to complete and become active.
   *
   * This method continuously polls the Composio API to check the status of a connection
   * until it either becomes active, enters a terminal error state, or times out.
   *
   * @param {string} connectedAccountId - The ID of the connected account to wait for
   * @param {number} [timeout=60000] - Maximum time to wait in milliseconds (default: 60 seconds)
   * @returns {Promise<ConnectedAccountRetrieveResponse>} The finalized connected account data
   * @throws {ComposioConnectedAccountNotFoundError} If the connected account cannot be found
   * @throws {ConnectionRequestFailedError} If the connection enters a failed, expired, or deleted state
   * @throws {ConnectionRequestTimeoutError} If the connection does not complete within the timeout period
   *
   * @example
   * ```typescript
   * // Wait for a connection to complete with default timeout
   * const connectedAccount = await composio.connectedAccounts.waitForConnection('conn_123abc');
   *
   * // Wait with a custom timeout of 2 minutes
   * const connectedAccount = await composio.connectedAccounts.waitForConnection('conn_123abc', 120000);
   * ```
   */
  async waitForConnection(
    connectedAccountId: string,
    timeout: number = 60000
  ): Promise<ConnectedAccountRetrieveResponse> {
    const connectionRequest = new ConnectionRequest(this.client, connectedAccountId);
    return connectionRequest.waitForConnection(timeout);
  }

  /**
   * Retrieves a specific connected account by its ID.
   *
   * This method fetches detailed information about a single connected account
   * and transforms the response to the SDK's standardized format.
   *
   * @param {string} nanoid - The unique identifier of the connected account
   * @returns {Promise<ConnectedAccountRetrieveResponse>} The connected account details
   * @throws {Error} If the connected account cannot be found or an API error occurs
   *
   * @example
   * ```typescript
   * // Get a connected account by ID
   * const account = await composio.connectedAccounts.get('conn_abc123');
   * console.log(account.status); // e.g., 'ACTIVE'
   * console.log(account.toolkit.slug); // e.g., 'github'
   * ```
   */
  async get(nanoid: string): Promise<ConnectedAccountRetrieveResponse> {
    const response = await this.client.connectedAccounts.retrieve(nanoid);
    return this.transformConnectedAccountResponse(response);
  }

  /**
   * Deletes a connected account.
   *
   * This method permanently removes a connected account from the Composio platform.
   * This action cannot be undone and will revoke any access tokens associated with the account.
   *
   * @param {string} nanoid - The unique identifier of the connected account to delete
   * @returns {Promise<ConnectedAccountDeleteResponse>} The deletion response
   * @throws {Error} If the account doesn't exist or cannot be deleted
   *
   * @example
   * ```typescript
   * // Delete a connected account
   * await composio.connectedAccounts.delete('conn_abc123');
   * ```
   */
  async delete(nanoid: string): Promise<ConnectedAccountDeleteResponse> {
    return this.client.connectedAccounts.delete(nanoid);
  }

  /**
   * Refreshes a connected account's authentication credentials.
   *
   * This method attempts to refresh OAuth tokens or other credentials associated with
   * the connected account. This is useful when a token has expired or is about to expire.
   *
   * @param {string} nanoid - The unique identifier of the connected account to refresh
   * @returns {Promise<ConnectedAccountRefreshResponse>} The response containing the refreshed account details
   * @throws {Error} If the account doesn't exist or credentials cannot be refreshed
   *
   * @example
   * ```typescript
   * // Refresh a connected account's credentials
   * const refreshedAccount = await composio.connectedAccounts.refresh('conn_abc123');
   * ```
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
