import { ComposioError } from './ComposioError';

export const PusherErrorCodes = {
  PUSHER_CLIENT_NOT_FOUND: 'PUSHER_CLIENT_NOT_FOUND',
  PUSHER_SUBSCRIPTION_ERROR: 'PUSHER_SUBSCRIPTION_ERROR',
} as const;

export class PusherClientNotFoundError extends ComposioError {
  public name = 'PusherClientNotFoundError';
  public code = PusherErrorCodes.PUSHER_CLIENT_NOT_FOUND;
  public statusCode = 404;
  public possibleFixes = ['Please contact support.'];

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class PusherSubscriptionError extends ComposioError {
  public name = 'PusherSubscriptionError';
  public code = PusherErrorCodes.PUSHER_SUBSCRIPTION_ERROR;
  public statusCode = 400;
  public possibleFixes = ['Please contact support.'];

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}
