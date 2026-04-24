import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const FileModifierErrorCodes = {
  FILE_UPLOAD_FAILED: 'FILE_UPLOAD_FAILED',
  SENSITIVE_FILE_PATH_BLOCKED: 'SENSITIVE_FILE_PATH_BLOCKED',
  FILE_UPLOAD_ABORTED: 'FILE_UPLOAD_ABORTED',
  FILE_UPLOAD_PATH_NOT_ALLOWED: 'FILE_UPLOAD_PATH_NOT_ALLOWED',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
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

/**
 * Thrown when automatic file upload during tool execution is attempted from a path
 * that is outside the configured {@link ComposioConfig.fileUploadDirs} allowlist.
 *
 * This only fires for auto-upload (enabled via
 * `dangerouslyAllowAutoUploadDownloadFiles: true`). Manual `composio.files.upload()`
 * calls are never subject to this check.
 */
export class ComposioFileUploadPathNotAllowedError extends ComposioFileUploadError {
  constructor(message: string, options: ComposioErrorOptions = {}) {
    super(message, {
      ...options,
      code: FileModifierErrorCodes.FILE_UPLOAD_PATH_NOT_ALLOWED,
      possibleFixes: options.possibleFixes ?? [
        'Move the file under one of the directories in `fileUploadDirs`',
        'Stage the file under the default upload dir (`~/.composio/temp`)',
        'Add the containing directory to `fileUploadDirs` when constructing Composio',
        'Pass the file by URL or as a File/Blob object instead of a filesystem path',
      ],
    });
    this.name = 'ComposioFileUploadPathNotAllowedError';
  }
}

/**
 * Thrown when a local file path passed for upload does not exist on disk.
 * Provides extra debugging context (resolved absolute path, cwd, allowlist state)
 * to help the caller distinguish between "typo" and "not-allowlisted" failures.
 */
export class ComposioFileNotFoundError extends ComposioFileUploadError {
  constructor(message: string, options: ComposioErrorOptions = {}) {
    super(message, {
      ...options,
      code: FileModifierErrorCodes.FILE_NOT_FOUND,
      possibleFixes: options.possibleFixes ?? [
        'Double-check the path for typos',
        'Remember relative paths are resolved against process.cwd() at upload time',
        'Verify the file exists and the process has read permission',
      ],
    });
    this.name = 'ComposioFileNotFoundError';
  }
}
