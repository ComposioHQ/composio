import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const ConnectionRequestErrorCodes = {
  CONNECTION_REQUEST_TIMEOUT: 'CONNECTION_REQUEST_TIMEOUT',
  CONNECTION_REQUEST_FAILED: 'CONNECTION_REQUEST_FAILED',
} as const;

export class ConnectionRequestTimeoutError extends ComposioError {
  constructor(
    message: string = 'Connection request timed out',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: ConnectionRequestErrorCodes.CONNECTION_REQUEST_TIMEOUT,
    });
    this.name = 'ConnectionRequestTimeoutError';
  }
}

export class ConnectionRequestFailedError extends ComposioError {
  constructor(
    message: string = 'Connection request failed',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: ConnectionRequestErrorCodes.CONNECTION_REQUEST_FAILED,
    });
    this.name = 'ConnectionRequestFailedError';
  }
}
