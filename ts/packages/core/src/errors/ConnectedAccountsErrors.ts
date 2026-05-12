import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const ConnectedAccountErrorCodes = {
  CONNECTED_ACCOUNT_NOT_FOUND: 'CONNECTED_ACCOUNT_NOT_FOUND',
  MULTIPLE_CONNECTED_ACCOUNTS: 'MULTIPLE_CONNECTED_ACCOUNTS',
  FAILED_TO_CREATE_CONNECTED_ACCOUNT_LINK: 'FAILED_TO_CREATE_CONNECTED_ACCOUNT_LINK',
  LEGACY_CONNECTED_ACCOUNTS_ENDPOINT_RETIRED: 'LEGACY_CONNECTED_ACCOUNTS_ENDPOINT_RETIRED',
  SHARED_ACCESS_DENIED: 'SHARED_ACCESS_DENIED',
  ACL_ONLY_FOR_SHARED: 'ACL_ONLY_FOR_SHARED',
  SHARED_CONNECTION_NOT_ACCESSIBLE: 'SHARED_CONNECTION_NOT_ACCESSIBLE',
} as const;

export class ComposioConnectedAccountNotFoundError extends ComposioError {
  constructor(
    message: string = 'Connected account not found',
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    super(message, {
      ...options,
      code: ConnectedAccountErrorCodes.CONNECTED_ACCOUNT_NOT_FOUND,
      statusCode: 404,
      possibleFixes: options.possibleFixes || [
        'Ensure the connected account exists and is active in your Composio dashboard',
      ],
    });
    this.name = 'ComposioConnectedAccountNotFoundError';
  }
}

export class ComposioMultipleConnectedAccountsError extends ComposioError {
  constructor(
    message: string = 'Multiple connected accounts found',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: ConnectedAccountErrorCodes.MULTIPLE_CONNECTED_ACCOUNTS,
      possibleFixes: options.possibleFixes || [
        'Use the allowMultiple flag to allow multiple connected accounts per user for an auth config',
      ],
    });
    this.name = 'ComposioMultipleConnectedAccountsError';
  }
}

export class ComposioFailedToCreateConnectedAccountLink extends ComposioError {
  constructor(
    message: string = 'Failed to create connected account link',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: ConnectedAccountErrorCodes.FAILED_TO_CREATE_CONNECTED_ACCOUNT_LINK,
    });
    this.name = 'ComposioFailedToCreateConnectedAccountLink';
  }
}

/**
 * Thrown when a tool execution attempts to use a SHARED connected account
 * but the requesting `userId` is not allowed by the connection's ACL.
 *
 * Surfaces when a SHARED connection is reached directly (e.g. via
 * `composio.tools.execute(slug, { connectedAccountId })`) without going
 * through a tool-router session.
 */
export class ComposioSharedAccessDeniedError extends ComposioError {
  constructor(
    message: string = 'Access denied: this SHARED connected account is not available to the requesting user',
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    super(message, {
      ...options,
      code: ConnectedAccountErrorCodes.SHARED_ACCESS_DENIED,
      statusCode: 403,
      possibleFixes: options.possibleFixes || [
        "Ask the connection's creator to grant access via composio.connectedAccounts.updateAcl() — set allowAllUsers, add the userId to allowedUserIds, or remove it from notAllowedUserIds.",
      ],
    });
    this.name = 'ComposioSharedAccessDeniedError';
  }
}

/**
 * Thrown when ACL fields (`allowAllUsers`, `allowedUserIds`,
 * `notAllowedUserIds`) are sent on a `PRIVATE` connection — at create
 * time or via PATCH. ACL is only meaningful for `SHARED` connections.
 */
export class ComposioAclOnlyForSharedError extends ComposioError {
  constructor(
    message: string = 'ACL fields are only valid on SHARED connected accounts',
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    super(message, {
      ...options,
      code: ConnectedAccountErrorCodes.ACL_ONLY_FOR_SHARED,
      statusCode: 400,
      possibleFixes: options.possibleFixes || [
        'Use accountType: "SHARED", or omit ACL fields when creating/updating a PRIVATE connection.',
      ],
    });
    this.name = 'ComposioAclOnlyForSharedError';
  }
}

/**
 * Thrown by `toolRouter.session.create()` / `session.patch()` when the
 * session's `userId` cannot use a pinned SHARED connection. Raised at
 * session-create time so the session never enters a state that fails
 * mid-execution.
 */
export class ComposioSharedConnectionNotAccessibleError extends ComposioError {
  constructor(
    message: string = 'A SHARED connected account pinned in the session config is not accessible to the session user',
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    super(message, {
      ...options,
      code: ConnectedAccountErrorCodes.SHARED_CONNECTION_NOT_ACCESSIBLE,
      statusCode: 400,
      possibleFixes: options.possibleFixes || [
        "Grant the session user access via composio.connectedAccounts.updateAcl() on the pinned connection, or pin a different connection the user can use.",
      ],
    });
    this.name = 'ComposioSharedConnectionNotAccessibleError';
  }
}

/**
 * Thrown by `composio.connectedAccounts.initiate()` when the legacy
 * `POST /api/v3/connected_accounts` endpoint rejects a Composio-managed
 * OAuth (OAuth1, OAuth2, DCR_OAUTH) auth-config request.
 *
 * The retiring path is being phased out — new orgs from 2026-05-08 and
 * all remaining orgs from 2026-07-03. Migrate the call to
 * `composio.connectedAccounts.link()`, which works for every redirectable
 * scheme regardless of whether the auth config is Composio-managed or
 * custom.
 *
 * See: https://docs.composio.dev/docs/changelog/2026/04/24
 */
export class ComposioLegacyConnectedAccountsEndpointRetiredError extends ComposioError {
  constructor(
    message: string = 'POST /api/v3/connected_accounts is no longer supported for Composio-managed OAuth auth configs. Use composio.connectedAccounts.link() instead.',
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    super(message, {
      ...options,
      code: ConnectedAccountErrorCodes.LEGACY_CONNECTED_ACCOUNTS_ENDPOINT_RETIRED,
      statusCode: 400,
      possibleFixes: options.possibleFixes || [
        'Replace `composio.connectedAccounts.initiate(userId, authConfigId, options)` with `composio.connectedAccounts.link(userId, authConfigId, options)`. The return shape (id, redirectUrl, waitForConnection()) is the same.',
        'Migration guide: https://docs.composio.dev/docs/changelog/2026/04/24',
      ],
    });
    this.name = 'ComposioLegacyConnectedAccountsEndpointRetiredError';
  }
}
