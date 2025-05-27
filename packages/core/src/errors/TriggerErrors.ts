import { ComposioError } from '@composio/client';

export const TriggerErrorCodes = {
  TRIGGER_FAILED_TO_GET_SDK_REALTIME_CREDENTIALS: 'TRIGGER_FAILED_TO_GET_SDK_REALTIME_CREDENTIALS',
  TRIGGER_FAILED_TO_CREATE_PUSHER_CLIENT: 'TRIGGER_FAILED_TO_CREATE_PUSHER_CLIENT',
  TRIGGER_FAILED_TO_SUBSCRIBE_TO_PUSHER_CHANNEL: 'TRIGGER_FAILED_TO_SUBSCRIBE_TO_PUSHER_CHANNEL',
  TRIGGER_FAILED_TO_UNSUBSCRIBE_FROM_PUSHER_CHANNEL:
    'TRIGGER_FAILED_TO_UNSUBSCRIBE_FROM_PUSHER_CHANNEL',
} as const;

export class ComposioFailedToGetSDKRealtimeCredentialsError extends ComposioError {
  public name = 'ComposioFailedToGetSDKRealtimeCredentialsError';
  public code = TriggerErrorCodes.TRIGGER_FAILED_TO_GET_SDK_REALTIME_CREDENTIALS;
  public statusCode = 500;
  public possibleFixes = ['Please contact support.'];

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class ComposioFailedToCreatePusherClientError extends ComposioError {
  public name = 'ComposioFailedToCreatePusherClientError';
  public code = TriggerErrorCodes.TRIGGER_FAILED_TO_CREATE_PUSHER_CLIENT;
  public statusCode = 500;
  public possibleFixes = ['Please contact support.'];

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class ComposioFailedToSubscribeToPusherChannelError extends ComposioError {
  public name = 'ComposioFailedToSubscribeToPusherChannelError';
  public code = TriggerErrorCodes.TRIGGER_FAILED_TO_SUBSCRIBE_TO_PUSHER_CHANNEL;
  public statusCode = 500;
  public possibleFixes = ['Please contact support.'];

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class ComposioFailedToUnsubscribeFromPusherChannelError extends ComposioError {
  public name = 'ComposioFailedToUnsubscribeFromPusherChannelError';
  public code = TriggerErrorCodes.TRIGGER_FAILED_TO_UNSUBSCRIBE_FROM_PUSHER_CHANNEL;
  public statusCode = 500;
  public possibleFixes = ['Please contact support.'];

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}
