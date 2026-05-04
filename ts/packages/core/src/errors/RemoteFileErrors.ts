import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const RemoteFileErrorCodes = {
  DOWNLOAD_FAILED: 'REMOTE_FILE_DOWNLOAD_FAILED',
} as const;

export interface RemoteFileDownloadErrorOptions extends Omit<ComposioErrorOptions, 'code'> {
  /** HTTP status code from the failed response */
  statusCode?: number;
  /** HTTP status text (e.g. "Not Found", "Forbidden") */
  statusText?: string;
  /** The presigned download URL that failed */
  downloadUrl?: string;
  /** Mount-relative path of the file (e.g. "output/report.pdf") */
  mountRelativePath?: string;
  /** Filename extracted from the mount path */
  filename?: string;
}

/**
 * Error thrown when fetching a remote file from a tool router session mount fails.
 * Includes HTTP status, URL, and file path context for debugging.
 */
export class RemoteFileDownloadError extends ComposioError {
  constructor(
    message: string = 'Failed to download remote file',
    options: RemoteFileDownloadErrorOptions = {}
  ) {
    const {
      statusCode,
      statusText,
      downloadUrl,
      mountRelativePath,
      filename,
      meta: optionsMeta,
      ...rest
    } = options;

    const meta: Record<string, unknown> = {
      ...optionsMeta,
      ...(statusCode !== undefined && { statusCode }),
      ...(statusText && { statusText }),
      ...(downloadUrl && { downloadUrl }),
      ...(mountRelativePath && { mountRelativePath }),
      ...(filename && { filename }),
    };

    super(message, {
      ...rest,
      code: RemoteFileErrorCodes.DOWNLOAD_FAILED,
      statusCode,
      meta: Object.keys(meta).length > 0 ? meta : undefined,
      possibleFixes: options.possibleFixes ?? [
        'Verify the download URL has not expired (check expiresAt)',
        'Ensure the file exists at the specified mount path',
        'Retry the operation; presigned URLs may have transient failures',
      ],
    });

    this.name = 'RemoteFileDownloadError';
  }
}
