import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const ConnectedAccountErrorCodes = {
  CONNECTED_ACCOUNT_NOT_FOUND: 'CONNECTED_ACCOUNT_NOT_FOUND',
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
