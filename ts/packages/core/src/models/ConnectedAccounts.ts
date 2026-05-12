/**
 * @fileoverview Connected accounts class for Composio SDK, used to manage connected accounts of a user.
 *
 * @author Musthaq Ahamad <musthaq@composio.dev>
 * @date 2025-05-05
 * @module ConnectedAccounts
 */
import ComposioClient, { BadRequestError } from '@composio/client';
import {
  ConnectedAccountCreateResponse,
  ConnectedAccountDeleteResponse,
  ConnectedAccountPatchParams,
  ConnectedAccountPatchResponse,
  ConnectedAccountRefreshParams,
  ConnectedAccountRefreshResponse,
  ConnectedAccountUpdateStatusParams,
  ConnectedAccountUpdateStatusResponse,
  ConnectedAccountListParams as ConnectedAccountListParamsRaw,
  ConnectedAccountCreateParams as ConnectedAccountCreateParamsRaw,
} from '@composio/client/resources/connected-accounts';
import { LinkCreateParams } from '@composio/client/resources/link';
import {
  CreateConnectedAccountOptions,
  ConnectedAccountRetrieveResponse,
  ConnectedAccountListParams,
  ConnectedAccountListParamsSchema,
  ConnectedAccountListResponse,
  CreateConnectedAccountLinkOptions,
  CreateConnectedAccountLinkOptionsSchema,
  ConnectedAccountStatuses,
  ConnectedAccountRefreshOptions,
  ConnectedAccountRefreshOptionsSchema,
  UpdateConnectedAccountParams,
  UpdateConnectedAccountParamsSchema,
  UpdateConnectedAccountAclParams,
  UpdateConnectedAccountAclParamsSchema,
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
  ComposioAclOnlyForSharedError,
  ComposioFailedToCreateConnectedAccountLink,
  ComposioLegacyConnectedAccountsEndpointRetiredError,
  ComposioMultipleConnectedAccountsError,
} from '../errors';
import logger from '../utils/logger';
import { ConnectionData } from '../types/connectedAccountAuthStates.types';

// One-time-per-process guard so long-running services don't spam the deprecation
// warning on every initiate() call.
let _legacyInitiateWarningEmitted = false;

/**
 * Serialise the SDK's `aclConfigForShared` (camelCase) to the wire's
 * `acl_config_for_shared` block. Returns `undefined` when the caller
 * didn't pass anything (PATCH-style "don't touch ACL"); returns `{}`
 * when the caller passed an explicit empty object — both mean
 * deny-by-default, but the explicit form preserves the caller's intent
 * in network traces.
 */
function serializeAclConfigForWire(
  acl:
    | {
        allowAllUsers?: boolean;
        allowedUserIds?: string[];
        notAllowedUserIds?: string[];
      }
    | undefined
): LinkCreateParams.ACLConfigForShared | undefined {
  if (acl === undefined) return undefined;
  return {
    ...(acl.allowAllUsers !== undefined && { allow_all_users: acl.allowAllUsers }),
    ...(acl.allowedUserIds !== undefined && { allowed_user_ids: acl.allowedUserIds }),
    ...(acl.notAllowedUserIds !== undefined && { not_allowed_user_ids: acl.notAllowedUserIds }),
  };
}

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
        // Cast widens to match the Stainless-generated client params, which
        // lag behind the live API enum. Apollo accepts the union value at
        // runtime (`z.nativeEnum(ConnectionStatusEnum)` on the query param);
        // remove the cast once `@composio/client` is regenerated.
        statuses: parsedQuery.data.statuses as ConnectedAccountListParamsRaw['statuses'],
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
   * **Deprecated for Composio-managed OAuth (OAuth1, OAuth2, DCR_OAUTH).**
   * The legacy `POST /api/v3/connected_accounts` endpoint that this method
   * wraps is being retired for Composio-managed auth configs on redirectable
   * schemes. The cutover is **2026-05-08** for new organizations and
   * **2026-07-03** for all remaining organizations. After your org's cutover,
   * this method will throw {@link ComposioLegacyConnectedAccountsEndpointRetiredError}
   * for that specific combination.
   *
   * Use {@link ConnectedAccounts.link} for Composio-managed OAuth — it works for
   * every redirectable scheme regardless of whether the auth config is
   * Composio-managed or custom, and the return shape is the same.
   *
   * Custom auth configs (your own OAuth app) and non-OAuth schemes (API key,
   * bearer token, basic auth) are unaffected and continue to work on
   * `initiate()`. See https://docs.composio.dev/docs/changelog/2026/04/24
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
      statuses: [ConnectedAccountStatuses.ACTIVE],
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

    const createParams: ConnectedAccountCreateParamsRaw = {
      auth_config: { id: authConfigId },
      connection: {
        callback_url: options?.callbackUrl,
        user_id: userId,
        state: state as ConnectedAccountCreateParamsRaw.Connection['state'],
        ...(options?.alias != null && { alias: options.alias }),
      },
    };

    let response: ConnectedAccountCreateResponse;
    let httpResponse: Response | undefined;
    try {
      // Chain `.withResponse()` so we can read the SEC-339 `Deprecation`
      // header (RFC 9745) the apollo retiring branch sets — that header is
      // emitted only when the auth config is Composio-managed AND on a
      // redirectable OAuth scheme, so it's the canonical signal that this
      // caller needs to migrate. Custom auth configs and non-OAuth schemes
      // never see the header, eliminating the false-positive warning that
      // an `auth_scheme`-only check produced for `link()`-unaffected callers.
      const apiCall = this.client.connectedAccounts.create(createParams);
      if (typeof (apiCall as { withResponse?: unknown }).withResponse === 'function') {
        const resolved = await (
          apiCall as unknown as {
            withResponse: () => Promise<{
              data: ConnectedAccountCreateResponse;
              response: Response;
            }>;
          }
        ).withResponse();
        response = resolved.data;
        httpResponse = resolved.response;
      } else {
        // Test mocks may return a plain Promise without `withResponse`.
        // Fall back to a naked await; the deprecation gate below stays
        // off in that case (no header to read).
        response = await apiCall;
      }
    } catch (error) {
      // When the server has flipped this org to the retired path, the legacy
      // endpoint returns 400 with a stable migration message. Surface it as
      // a typed error so callers get an actionable hint instead of a generic
      // BadRequestError.
      if (
        error instanceof BadRequestError &&
        typeof error.message === 'string' &&
        error.message.includes('no longer supported') &&
        error.message.includes('/api/v3/connected_accounts/link')
      ) {
        throw new ComposioLegacyConnectedAccountsEndpointRetiredError(error.message, {
          cause: error,
        });
      }
      throw error;
    }

    // Warn once per process when apollo flags this response as on the
    // retiring path. Header presence is a 1:1 signal — custom auth configs
    // and non-OAuth schemes get a clean response and stay silent, fixing
    // the false-positive that auth_scheme-based detection produced.
    if (!_legacyInitiateWarningEmitted && httpResponse?.headers.get('Deprecation')) {
      _legacyInitiateWarningEmitted = true;
      logger.warn(
        '[Deprecation] composio.connectedAccounts.initiate() will stop ' +
          'working for this auth config on or before 2026-07-03 (see Sunset ' +
          'header on the response). Switch to composio.connectedAccounts.link() — ' +
          'same return shape, same allowMultiple semantics. ' +
          'https://docs.composio.dev/docs/changelog/2026/04/24'
      );
    }

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

    // Mirror initiate(): guard against silently creating extra connections on
    // the same auth config unless the caller explicitly opts in.
    const existing = await this.list({
      userIds: [userId],
      authConfigIds: [authConfigId],
      statuses: [ConnectedAccountStatuses.ACTIVE],
    });
    if (existing.items.length > 0 && !requestOptions.data.allowMultiple) {
      throw new ComposioMultipleConnectedAccountsError(
        `Multiple connected accounts found for user ${userId} in auth config ${authConfigId}. Please use the allowMultiple option to allow multiple connected accounts.`
      );
    } else if (existing.items.length > 0) {
      logger.warn(
        `[Warn:AllowMultiple] Multiple connected accounts found for user ${userId} in auth config ${authConfigId}`
      );
    }

    const opts = requestOptions.data;
    const aclWire = serializeAclConfigForWire(opts.aclConfigForShared);
    const body: LinkCreateParams = {
      auth_config_id: authConfigId,
      user_id: userId,
      ...(opts.callbackUrl !== undefined && { callback_url: opts.callbackUrl }),
      ...(opts.alias !== undefined && { alias: opts.alias }),
      ...(opts.accountType !== undefined && { account_type: opts.accountType }),
      ...(aclWire !== undefined && { acl_config_for_shared: aclWire }),
    };

    try {
      const response = await this.client.link.create(body);

      const connectionRequest = createConnectionRequest(
        this.client,
        response.connected_account_id,
        ConnectedAccountStatuses.INITIATED,
        response.redirect_url
      );
      return connectionRequest;
    } catch (error) {
      // The server rejects ACL on PRIVATE connections — surface that as a
      // typed error so callers can `instanceof` instead of grepping messages.
      if (
        error instanceof BadRequestError &&
        typeof error.message === 'string' &&
        error.message.includes('acl_config_for_shared is only valid on SHARED')
      ) {
        throw new ComposioAclOnlyForSharedError(error.message, { cause: error });
      }
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
  async refresh(
    nanoid: string,
    options?: ConnectedAccountRefreshOptions
  ): Promise<ConnectedAccountRefreshResponse> {
    let params: ConnectedAccountRefreshParams | undefined = undefined;

    if (options) {
      const parsedOptions = ConnectedAccountRefreshOptionsSchema.safeParse(options);
      if (!parsedOptions.success) {
        throw new ValidationError('Failed to parse connected account refresh options', {
          cause: parsedOptions.error,
        });
      }

      params = {
        query_redirect_url: parsedOptions.data.redirectUrl,
        validate_credentials: parsedOptions.data.validateCredentials,
      };
    }

    return this.client.connectedAccounts.refresh(nanoid, params);
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

  /**
   * Enable or disable a connected account. Accepts `{ enabled: boolean }`.
   *
   * For ACL writes on SHARED connections, see {@link updateAcl}.
   *
   * @param {string} nanoid - The unique identifier of the connected account
   * @param {UpdateConnectedAccountParams} params - The update parameters
   * @returns {Promise<ConnectedAccountUpdateStatusResponse>} The update response
   *
   * @example
   * ```typescript
   * // Disable an account
   * await composio.connectedAccounts.update('ca_abc123', { enabled: false });
   * ```
   */
  async update(
    nanoid: string,
    params: UpdateConnectedAccountParams
  ): Promise<ConnectedAccountUpdateStatusResponse> {
    const parsedParams = UpdateConnectedAccountParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new ValidationError('Failed to parse connected account update params', {
        cause: parsedParams.error,
      });
    }

    return this.client.connectedAccounts.updateStatus(nanoid, parsedParams.data);
  }

  /**
   * Update the per-user ACL on a SHARED connected account.
   *
   * Only meaningful for SHARED connections — calling this on a PRIVATE
   * connection raises `ComposioAclOnlyForSharedError` (400). ACL writes
   * require the connection's creator or an API key; alias edits via
   * {@link update} are governed separately.
   *
   * PATCH semantics: omit a field to leave it unchanged; pass an empty array
   * to clear an allow/deny list. At least one field must be provided.
   *
   * Resolution rule (deny wins):
   *   1. requesting `userId` in `notAllowedUserIds` → DENY
   *   2. `allowAllUsers === true`                   → ALLOW
   *   3. requesting `userId` in `allowedUserIds`    → ALLOW
   *   4. otherwise                                  → DENY
   *
   * @example
   * ```typescript
   * // Allow every userId to use this connection
   * await composio.connectedAccounts.updateAcl('ca_abc', { allowAllUsers: true });
   *
   * // Everyone except a specific user
   * await composio.connectedAccounts.updateAcl('ca_abc', {
   *   allowAllUsers: true,
   *   notAllowedUserIds: ['user_bob'],
   * });
   *
   * // Targeted allow
   * await composio.connectedAccounts.updateAcl('ca_abc', {
   *   allowedUserIds: ['user_alice', 'user_bob'],
   * });
   *
   * // Revoke a previously-granted allow list (back to deny-by-default)
   * await composio.connectedAccounts.updateAcl('ca_abc', { allowedUserIds: [] });
   * ```
   *
   * **Empty-array semantics — read carefully.** Passing `[]` for either
   * list **replaces** the list, it does not extend it:
   *
   * - `allowedUserIds: []` → revoke all previously-granted user IDs (state
   *   reverts to deny-by-default unless `allowAllUsers` is true).
   * - `notAllowedUserIds: []` → **clears the deny list**, which silently
   *   re-grants access to users you previously blocked. Always pair an
   *   empty deny list with a deliberate audit of the allow side.
   *
   * @returns The PATCH response (`{ id, status, success }`). To read the
   * updated `aclConfigForShared` block, call `get(nanoid)` after the
   * promise resolves.
   */
  async updateAcl(
    nanoid: string,
    params: UpdateConnectedAccountAclParams
  ): Promise<ConnectedAccountPatchResponse> {
    const parsedParams = UpdateConnectedAccountAclParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new ValidationError('Failed to parse connected account ACL update params', {
        cause: parsedParams.error,
      });
    }

    const body: ConnectedAccountPatchParams = {
      acl_config_for_shared: serializeAclConfigForWire(parsedParams.data),
    };

    try {
      return await this.client.connectedAccounts.patch(nanoid, body);
    } catch (error) {
      // Same ACL-on-PRIVATE rejection the create path can hit — surface
      // it as a typed error.
      if (
        error instanceof BadRequestError &&
        typeof error.message === 'string' &&
        error.message.includes('acl_config_for_shared is only valid on SHARED')
      ) {
        throw new ComposioAclOnlyForSharedError(error.message, { cause: error });
      }
      throw error;
    }
  }
}
