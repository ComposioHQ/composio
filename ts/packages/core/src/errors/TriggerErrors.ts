import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const TriggerErrorCodes = {
  TRIGGER_FAILED_TO_GET_SDK_REALTIME_CREDENTIALS: 'TRIGGER_FAILED_TO_GET_SDK_REALTIME_CREDENTIALS',
  TRIGGER_FAILED_TO_CREATE_PUSHER_CLIENT: 'TRIGGER_FAILED_TO_CREATE_PUSHER_CLIENT',
  TRIGGER_FAILED_TO_SUBSCRIBE_TO_PUSHER_CHANNEL: 'TRIGGER_FAILED_TO_SUBSCRIBE_TO_PUSHER_CHANNEL',
  TRIGGER_FAILED_TO_UNSUBSCRIBE_FROM_PUSHER_CHANNEL:
    'TRIGGER_FAILED_TO_UNSUBSCRIBE_FROM_PUSHER_CHANNEL',
  TRIGGER_TYPE_NOT_FOUND: 'TRIGGER_TYPE_NOT_FOUND',
  WEBHOOK_SIGNATURE_VERIFICATION_FAILED: 'WEBHOOK_SIGNATURE_VERIFICATION_FAILED',
  WEBHOOK_PAYLOAD_INVALID: 'WEBHOOK_PAYLOAD_INVALID',
} as const;

export class ComposioFailedToGetSDKRealtimeCredentialsError extends ComposioError {
  constructor(
    message: string = 'Failed to get SDK realtime credentials',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: TriggerErrorCodes.TRIGGER_FAILED_TO_GET_SDK_REALTIME_CREDENTIALS,
      possibleFixes: options.possibleFixes || ['Please contact support.'],
    });
    this.name = 'ComposioFailedToGetSDKRealtimeCredentialsError';
  }
}

export class ComposioFailedToCreatePusherClientError extends ComposioError {
  constructor(
    message: string = 'Failed to create Pusher client',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: TriggerErrorCodes.TRIGGER_FAILED_TO_CREATE_PUSHER_CLIENT,
      possibleFixes: options.possibleFixes || ['Please contact support.'],
    });
    this.name = 'ComposioFailedToCreatePusherClientError';
  }
}

export class ComposioFailedToSubscribeToPusherChannelError extends ComposioError {
  constructor(
    message: string = 'Failed to subscribe to Pusher channel',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: TriggerErrorCodes.TRIGGER_FAILED_TO_SUBSCRIBE_TO_PUSHER_CHANNEL,
      possibleFixes: options.possibleFixes || ['Please contact support.'],
    });
    this.name = 'ComposioFailedToSubscribeToPusherChannelError';
  }
}

export class ComposioFailedToUnsubscribeFromPusherChannelError extends ComposioError {
  constructor(
    message: string = 'Failed to unsubscribe from Pusher channel',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: TriggerErrorCodes.TRIGGER_FAILED_TO_UNSUBSCRIBE_FROM_PUSHER_CHANNEL,
      possibleFixes: options.possibleFixes || ['Please contact support.'],
    });
    this.name = 'ComposioFailedToUnsubscribeFromPusherChannelError';
  }
}

export class ComposioTriggerTypeNotFoundError extends ComposioError {
  constructor(
    message: string = 'Trigger type not found',
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    super(message, {
      ...options,
      code: TriggerErrorCodes.TRIGGER_TYPE_NOT_FOUND,
      statusCode: 404,
      possibleFixes: options.possibleFixes || ['Please contact support.'],
    });
    this.name = 'ComposioTriggerTypeNotFoundError';
  }
}

export class ComposioWebhookSignatureVerificationError extends ComposioError {
  constructor(
    message: string = 'Webhook signature verification failed',
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    super(message, {
      ...options,
      code: TriggerErrorCodes.WEBHOOK_SIGNATURE_VERIFICATION_FAILED,
      statusCode: 401,
      possibleFixes: options.possibleFixes || [
        'Verify that the webhook secret is correct.',
        'Ensure the raw request body is passed without modifications.',
        'Check that the signature header value is being passed correctly.',
      ],
    });
    this.name = 'ComposioWebhookSignatureVerificationError';
  }
}

export class ComposioWebhookPayloadError extends ComposioError {
  constructor(
    message: string = 'Invalid webhook payload',
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    super(message, {
      ...options,
      code: TriggerErrorCodes.WEBHOOK_PAYLOAD_INVALID,
      statusCode: 400,
      possibleFixes: options.possibleFixes || [
        'Ensure the webhook payload is valid JSON.',
        'Verify the payload structure matches the expected format.',
      ],
    });
    this.name = 'ComposioWebhookPayloadError';
  }
}
