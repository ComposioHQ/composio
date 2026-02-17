import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const ConnectedAccountErrorCodes = {
  CONNECTED_ACCOUNT_NOT_FOUND: 'CONNECTED_ACCOUNT_NOT_FOUND',
  MULTIPLE_CONNECTED_ACCOUNTS: 'MULTIPLE_CONNECTED_ACCOUNTS',
  FAILED_TO_CREATE_CONNECTED_ACCOUNT_LINK: 'FAILED_TO_CREATE_CONNECTED_ACCOUNT_LINK',
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
