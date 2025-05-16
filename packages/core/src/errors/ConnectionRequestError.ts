import { ComposioError } from './ComposioError';

export const ConnectionRequestErrorCodes = {
  CONNECTION_REQUEST_TIMEOUT: 'CONNECTION_REQUEST_TIMEOUT',
} as const;

export class ConnectionRequestTimeoutError extends ComposioError {
  constructor(
    message: string = 'Connection request timed out',
    meta: Record<string, unknown> = {}
  ) {
    super(message, {
      code: ConnectionRequestErrorCodes.CONNECTION_REQUEST_TIMEOUT,
      meta,
    });
  }
}
