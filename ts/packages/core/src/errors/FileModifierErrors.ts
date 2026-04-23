import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const FileModifierErrorCodes = {
  FILE_UPLOAD_FAILED: 'FILE_UPLOAD_FAILED',
  SENSITIVE_FILE_PATH_BLOCKED: 'SENSITIVE_FILE_PATH_BLOCKED',
  FILE_UPLOAD_ABORTED: 'FILE_UPLOAD_ABORTED',
} as const;

export class ComposioFileUploadError extends ComposioError {
  constructor(message: string = 'Failed to upload file', options: ComposioErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? FileModifierErrorCodes.FILE_UPLOAD_FAILED,
      possibleFixes: options.possibleFixes || ['Check if the file exists in the location provided'],
    });
    this.name = 'ComposioFileUploadError';
  }
}

/**
 * Thrown when a local file path is refused before upload (sensitive directory or
 * credential-like file name). Subclass of {@link ComposioFileUploadError} so existing
 * `instanceof ComposioFileUploadError` handlers still apply.
 */
export class ComposioSensitiveFilePathBlockedError extends ComposioFileUploadError {
  constructor(message: string, options: ComposioErrorOptions = {}) {
    super(message, {
      ...options,
      code: FileModifierErrorCodes.SENSITIVE_FILE_PATH_BLOCKED,
      possibleFixes: options.possibleFixes ?? [
        'Use a file outside ~/.ssh, ~/.aws, and other credential locations',
        'Set sensitiveFileUploadProtection: false only if you understand the risk',
        'Add path segments to block with fileUploadPathDenySegments',
      ],
    });
    this.name = 'ComposioSensitiveFilePathBlockedError';
  }
}

/**
 * Thrown when a `beforeFileUpload` hook returns `false`.
 */
export class ComposioFileUploadAbortedError extends ComposioFileUploadError {
  constructor(message: string, options: ComposioErrorOptions = {}) {
    super(message, {
      ...options,
      code: FileModifierErrorCodes.FILE_UPLOAD_ABORTED,
      possibleFixes: options.possibleFixes ?? [
        'Change beforeFileUpload to return a file path to upload, or allow the upload to proceed',
      ],
    });
    this.name = 'ComposioFileUploadAbortedError';
  }
}
