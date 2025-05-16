import { ComposioError } from './ComposioError';

export const AuthConfigErrorCodes = {
  AUTH_CONFIG_NOT_FOUND: 'AUTH_CONFIG_NOT_FOUND',
} as const;

export class ComposioAuthConfigNotFoundError extends ComposioError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, {
      code: AuthConfigErrorCodes.AUTH_CONFIG_NOT_FOUND,
      cause: meta,
      possibleFixes: [
        'Check if the auth config exists',
        'Check if the auth config id is correct',
        'Check if the auth config is enabled',
      ],
    });
    this.name = 'ComposioAuthConfigNotFoundError';
  }
}
