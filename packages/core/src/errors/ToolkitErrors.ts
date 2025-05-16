import { ComposioError } from './ComposioError';

export const ToolkitErrorCodes = {
  TOOLKIT_NOT_FOUND: 'TOOLKIT_NOT_FOUND',
} as const;

export class ToolkitNotFoundError extends ComposioError {
  constructor(message: string = 'Toolkit not found', meta: Record<string, unknown> = {}) {
    super(message, {
      code: 'TOOLKIT_NOT_FOUND',
      statusCode: 404,
      meta,
      possibleFixes: ['Ensure the toolkit is correctly configured and the slug is valid'],
    });
  }
}
