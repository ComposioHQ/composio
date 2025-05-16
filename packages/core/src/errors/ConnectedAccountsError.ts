import { ComposioError } from './ComposioError';

export const ConnectedAccountErrorCodes = {
  CONNECTED_ACCOUNT_NOT_FOUND: 'CONNECTED_ACCOUNT_NOT_FOUND',
} as const;

export class ComposioConnectedAccountNotFoundError extends ComposioError {
  constructor(message: string = 'Connected account not found', meta: Record<string, unknown> = {}) {
    super(message, {
      code: ConnectedAccountErrorCodes.CONNECTED_ACCOUNT_NOT_FOUND,
      statusCode: 404,
      meta,
      possibleFixes: [
        'Ensure the connected account exists and is active in your Composio dashboard',
      ],
    });
  }
}
