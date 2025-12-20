import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const SDKErrorCodes = {
  NO_API_KEY_PROVIDED: 'NO_API_KEY_PROVIDED',
};

export class ComposioNoAPIKeyError extends ComposioError {
  constructor(
    message: string = 'No Composio API key provided',
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    const defaultCause =
      "Couldn't find an API key in the params, environment variables or in the user config file";

    super(message, {
      ...options,
      code: SDKErrorCodes.NO_API_KEY_PROVIDED,
      cause: options.cause || defaultCause,
      possibleFixes: options.possibleFixes || [
        'Ensure you have an API key passed in the params, or in environment variable (COMPOSIO_API_KEY) or in the user config file',
        'To get an API key, please sign up at https://composio.dev/signup',
        'You can also use the Composio CLI to create a project and get an API key',
      ],
      statusCode: 401,
    });
    this.name = 'ComposioNoAPIKeyError';
  }
}
