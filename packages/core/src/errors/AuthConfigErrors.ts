import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const AuthConfigErrorCodes = {
  AUTH_CONFIG_NOT_FOUND: 'AUTH_CONFIG_NOT_FOUND',
} as const;

export class ComposioAuthConfigNotFoundError extends ComposioError {
  constructor(
    message: string = 'Auth config not found',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: AuthConfigErrorCodes.AUTH_CONFIG_NOT_FOUND,
      possibleFixes: options.possibleFixes || [
        'Check if the auth config exists',
        'Check if the auth config id is correct',
        'Check if the auth config is enabled',
      ],
    });
    this.name = 'ComposioAuthConfigNotFoundError';
  }
}
