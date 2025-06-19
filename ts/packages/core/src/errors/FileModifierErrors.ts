import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const FileModifierErrorCodes = {
  FILE_UPLOAD_FAILED: 'FILE_UPLOAD_FAILED',
} as const;

export class ComposioFileUploadError extends ComposioError {
  constructor(
    message: string = 'Failed to upload file',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: FileModifierErrorCodes.FILE_UPLOAD_FAILED,
      possibleFixes: options.possibleFixes || ['Check if the file exists in the location provided'],
    });
    this.name = 'ComposioFileUploadError';
  }
}
