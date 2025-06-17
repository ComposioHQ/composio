import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const ToolkitErrorCodes = {
  TOOLKIT_NOT_FOUND: 'TOOLKIT_NOT_FOUND',
} as const;

export class ComposioToolkitNotFoundError extends ComposioError {
  constructor(
    message: string = 'Toolkit not found',
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    super(message, {
      ...options,
      code: 'TOOLKIT_NOT_FOUND',
      possibleFixes: options.possibleFixes || [
        'Ensure the toolkit is correctly configured and the slug is valid',
      ],
    });
    this.name = 'ComposioToolkitNotFoundError';
  }
}

export class ComposioToolkitFetchError extends ComposioError {
  constructor(
    message: string = 'Failed to fetch toolkit',
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    super(message, {
      ...options,
      code: 'TOOLKIT_FETCH_ERROR',
      possibleFixes: options.possibleFixes || [
        'Ensure the toolkit slug is valid',
        'Ensure you are using the correct API key',
        'Ensure you are using the correct API endpoint / Base URL and it is working',
      ],
    });
    this.name = 'ComposioToolkitFetchError';
  }
}
