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
  ConnectedAccountCreateParams as ConnectedAccountCreateParamsRaw,
} from '@composio/client/resources/connected-accounts';
import {
  CreateConnectedAccountOptions,
  ConnectedAccountRetrieveResponse,
  ConnectedAccountListParams,
  ConnectedAccountListParamsSchema,
  ConnectedAccountListResponse,
  CreateConnectedAccountLinkOptions,
  CreateConnectedAccountLinkOptionsSchema,
  ConnectedAccountStatuses,
} from '../types/connectedAccounts.types';
import { ConnectionRequest } from '../types/connectionRequest.types';
import { createConnectionRequest } from './ConnectionRequest';
import { ValidationError } from '../errors/ValidationErrors';
import { telemetry } from '../telemetry/Telemetry';
import {
  transformConnectedAccountListResponse,
  transformConnectedAccountResponse,
} from '../utils/transformers/connectedAccounts';
import {
  ComposioFailedToCreateConnectedAccountLink,
  ComposioMultipleConnectedAccountsError,
} from '../errors';
import logger from '../utils/logger';
import { ConnectionData } from '../types/connectedAccountAuthStates.types';
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
    telemetry.instrument(this, 'ConnectedAccounts');
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
        throw new ValidationError('Failed to parse connected account list query', {
          cause: parsedQuery.error,
        });
      }
      rawQuery = {
        auth_config_ids: parsedQuery.data.authConfigIds,
        cursor: parsedQuery.data.cursor?.toString(),
        limit: parsedQuery.data.limit,
        order_by: parsedQuery.data.orderBy,
        statuses: parsedQuery.data.statuses,
        toolkit_slugs: parsedQuery.data.toolkitSlugs,
        user_ids: parsedQuery.data.userIds,
      };
    }

    const result = await this.client.connectedAccounts.list(rawQuery);
    return transformConnectedAccountListResponse(result);
  }

  /**
   * Compound function to create a new connected account.
   * This function creates a new connected account and returns a connection request.
   * Users can then wait for the connection to be established using the `waitForConnection` method.
   *
   * @param {string} userId - User ID of the connected account
   * @param {string} authConfigId - Auth config ID of the connected account
   * @param {CreateConnectedAccountOptions} options - Options for creating a new connected account
   * @returns {Promise<ConnectionRequest>} Connection request object
   *
   * @example
   * ```typescript
   * // For OAuth2 authentication
   * const connectionRequest = await composio.connectedAccounts.initiate(
   *   'user_123',
   *   'auth_config_123',
   *   {
   *     callbackUrl: 'https://your-app.com/callback',
   *     config: AuthScheme.OAuth2({
   *       access_token: 'your_access_token',
   *       token_type: 'Bearer'
   *     })
   *   }
   * );
   *
   * // For API Key authentication
   * const connectionRequest = await composio.connectedAccounts.initiate(
   *   'user_123',
   *   'auth_config_123',
   *   {
   *     config: AuthScheme.ApiKey({
   *       api_key: 'your_api_key'
   *     })
   *   }
   * );
   *
   * // For Basic authentication
   * const connectionRequest = await composio.connectedAccounts.initiate(
   *   'user_123',
   *   'auth_config_123',
   *   {
   *     config: AuthScheme.Basic({
   *       username: 'your_username',
   *       password: 'your_password'
   *     })
   *   }
   * );
   * ```
   *
   * @link https://docs.composio.dev/reference/connected-accounts/create-connected-account
   */
  async initiate(
    userId: string,
    authConfigId: string,
    options?: CreateConnectedAccountOptions
  ): Promise<ConnectionRequest> {
    // Check if there are multiple connected accounts for the authConfig of the user
    const connectedAccount = await this.list({
      userIds: [userId],
      authConfigIds: [authConfigId],
    });
    if (connectedAccount.items.length > 0 && !options?.allowMultiple) {
      throw new ComposioMultipleConnectedAccountsError(
        `Multiple connected accounts found for user ${userId} in auth config ${authConfigId}. Please use the allowMultiple option to allow multiple connected accounts.`
      );
    } else if (connectedAccount.items.length > 0) {
      logger.warn(
        `[Warn:AllowMultiple] Multiple connected accounts found for user ${userId} in auth config ${authConfigId}`
      );
    }

    const state: ConnectionData | undefined = options?.config ?? undefined;
    // @TODO: Commenting this out. This is a temporary fix to allow api_key to be optional, in future ideally we should fix this from API side

    // if (options?.config) {
    //   const connectionDataParsed = ConnectionDataSchema.safeParse(options.config);
    //   if (!connectionDataParsed.success) {
    //     throw new ValidationError('Failed to parse connection data', {
    //       cause: connectionDataParsed.error,
    //     });
    //   }
    //   state = connectionDataParsed.data;
    // }

    const response = await this.client.connectedAccounts.create({
      auth_config: {
        id: authConfigId,
      },
      connection: {
        ...(options?.callbackUrl && { callback_url: options.callbackUrl }),
        user_id: userId,
        state,
      },
      // @TODO: This is a temporary fix to allow api_key to be optional, in future ideally we should fix this from API side
    } as ConnectedAccountCreateParamsRaw);

    const redirectUrl =
      typeof response.connectionData?.val?.redirectUrl === 'string'
        ? response.connectionData.val.redirectUrl
        : null;

    return createConnectionRequest(
      this.client,
      response.id,
      response.connectionData.val.status,
      redirectUrl
    );
  }

  /**
   * @description Create a Composio Connect Link for a user to connect their account to a given auth config. This method will return an external link which you can use the user to connect their account.
   *
   * @docs https://docs.composio.dev/reference/connected-accounts/create-connected-account#create-a-composio-connect-link
   *
   * @param userId {string} - The external user ID to create the connected account for.
   * @param authConfigId {string} - The auth config ID to create the connected account for.
   * @param options {CreateConnectedAccountOptions} - Options for creating a new connected account.
   * @param options.callbackUrl {string} - The url to redirect the user to post connecting their account.
   * @returns {ConnectionRequest} Connection request object
   *
   * @example
   * ```typescript
   * // create a connection request and redirect the user to the redirect url
   * const connectionRequest = await composio.connectedAccounts.link('user_123', 'auth_config_123');
   * const redirectUrl = connectionRequest.redirectUrl;
   * console.log(`Visit: ${redirectUrl} to authenticate your account`);
   *
   * // Wait for the connection to be established
   * const connectedAccount = await connectionRequest.waitForConnection()
   * ```
   *
   * @example
   * ```typescript
   * // create a connection request and redirect the user to the redirect url
   * const connectionRequest = await composio.connectedAccounts.link('user_123', 'auth_config_123', {
   *   callbackUrl: 'https://your-app.com/callback'
   * });
   * const redirectUrl = connectionRequest.redirectUrl;
   * console.log(`Visit: ${redirectUrl} to authenticate your account`);
   *
   * // Wait for the connection to be established
   * const connectedAccount = await composio.connectedAccounts.waitForConnection(connectionRequest.id);
   * ```
   */
  async link(
    userId: string,
    authConfigId: string,
    options?: CreateConnectedAccountLinkOptions
  ): Promise<ConnectionRequest> {
    const requestOptions = await CreateConnectedAccountLinkOptionsSchema.safeParse(options || {});
    if (!requestOptions.success) {
      throw new ValidationError('Failed to parse create connected account link options', {
        cause: requestOptions.error,
      });
    }

    try {
      const response = await this.client.link.create({
        auth_config_id: authConfigId,
        user_id: userId,
        ...(requestOptions?.data.callbackUrl && { callback_url: requestOptions.data.callbackUrl }),
      });

      const connectionRequest = createConnectionRequest(
        this.client,
        response.connected_account_id,
        ConnectedAccountStatuses.INITIATED,
        response.redirect_url
      );
      return connectionRequest;
    } catch (error) {
      throw new ComposioFailedToCreateConnectedAccountLink(
        'Failed to create connected account link',
        {
          cause: error,
        }
      );
    }
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
    const connectionRequest = createConnectionRequest(this.client, connectedAccountId);
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
    return transformConnectedAccountResponse(response);
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
   * @returns {Promise<ConnectedAccountUpdateStatusResponse>} Updated connected account details
   *
   * @example
   * ```typescript
   * // Enable a connected account
   * const updatedAccount = await composio.connectedAccounts.updateStatus('conn_abc123', {
   *   enabled: true
   * });
   *
   * // Disable a connected account with a reason
   * const disabledAccount = await composio.connectedAccounts.updateStatus('conn_abc123', {
   *   enabled: false,
   *   reason: 'Token expired'
   * });
   * ```
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
   * @returns {Promise<ConnectedAccountUpdateStatusResponse>} Updated connected account details
   *
   * @example
   * ```typescript
   * // Enable a previously disabled connected account
   * const enabledAccount = await composio.connectedAccounts.enable('conn_abc123');
   * console.log(enabledAccount.isDisabled); // false
   * ```
   */
  async enable(nanoid: string): Promise<ConnectedAccountUpdateStatusResponse> {
    return this.client.connectedAccounts.updateStatus(nanoid, { enabled: true });
  }

  /**
   * Disable a connected account
   * @param {string} nanoid - Unique identifier of the connected account
   * @returns {Promise<ConnectedAccountUpdateStatusResponse>} Updated connected account details
   *
   * @example
   * ```typescript
   * // Disable a connected account
   * const disabledAccount = await composio.connectedAccounts.disable('conn_abc123');
   * console.log(disabledAccount.isDisabled); // true
   *
   * // You can also use updateStatus with a reason
   * // const disabledAccount = await composio.connectedAccounts.updateStatus('conn_abc123', {
   * //   enabled: false,
   * //   reason: 'No longer needed'
   * // });
   * ```
   */
  async disable(nanoid: string): Promise<ConnectedAccountUpdateStatusResponse> {
    return this.client.connectedAccounts.updateStatus(nanoid, { enabled: false });
  }
}
