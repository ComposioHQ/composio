import { platform } from '#platform';
import { COMPOSIO_DIR, TEMP_FILES_DIRECTORY_NAME } from '../utils/constants';

function getParentDir(filePath: string): string {
  const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastSep <= 0) return '';
  return filePath.slice(0, lastSep);
}
import { RemoteFileData, RemoteFileDataSchema } from '../types/ToolRouterSessionFilesMount.types';
import { RemoteFileDownloadError, ValidationError } from '../errors';

/**
 * Represents a file stored in a tool router session's file mount.
 * Provides methods to fetch, save, and work with the file content.
 *
 * @example
 * ```typescript
 * const remoteFile = await session.files.download('/output/report.pdf');
 * const buffer = await remoteFile.buffer();
 * await remoteFile.save('/tmp/report.pdf');
 * const text = await remoteFile.text();
 * ```
 *
 * @example
 * ```typescript
 * // Create from API response (snake_case)
 * const remoteFile = RemoteFile.parse(apiResponse);
 *
 * // Or create from parsed data (camelCase)
 * const remoteFile = new RemoteFile({
 *   expiresAt: '...',
 *   mountRelativePath: 'report.pdf',
 *   sandboxMountPrefix: '/mnt/files',
 *   downloadUrl: 'https://...',
 * });
 * ```
 */
export class RemoteFile {
  /** ISO 8601 timestamp when the download URL expires */
  readonly expiresAt: string;

  /** Relative path within the mount (e.g. "report.pdf") */
  readonly mountRelativePath: string;

  /** Absolute mount path inside the sandbox (e.g. /mnt/files) */
  readonly sandboxMountPrefix: string;

  /** Presigned URL for downloading the file */
  readonly downloadUrl: string;

  constructor(data: RemoteFileData) {
    this.expiresAt = data.expiresAt;
    this.mountRelativePath = data.mountRelativePath;
    this.sandboxMountPrefix = data.sandboxMountPrefix;
    this.downloadUrl = data.downloadUrl;
  }

  /**
   * Parses an API response (snake_case) and returns a RemoteFile instance.
   * @param data - Raw API response with snake_case keys
   * @returns A RemoteFile instance
   * @throws ValidationError if the response shape is invalid
   */
  static parse(data: unknown): RemoteFile {
    const parsed = RemoteFileDataSchema.safeParse(data);
    if (!parsed.success) {
      throw new ValidationError('Failed to parse remote file response', {
        cause: parsed.error,
      });
    }
    return new RemoteFile(parsed.data);
  }

  /** Filename extracted from the mount path (e.g. "report.pdf" from "output/report.pdf") */
  get filename(): string {
    return platform.basename(this.mountRelativePath);
  }

  /**
   * Fetches the file content as a buffer.
   * @returns The file content as a Uint8Array
   * @throws RemoteFileDownloadError if the fetch fails
   */
  async buffer(): Promise<Uint8Array> {
    const response = await fetch(this.downloadUrl);
    if (!response.ok) {
      throw new RemoteFileDownloadError(
        `Failed to download file: ${response.status} ${response.statusText}`,
        {
          statusCode: response.status,
          statusText: response.statusText,
          downloadUrl: this.downloadUrl,
          mountRelativePath: this.mountRelativePath,
          filename: this.filename,
          cause: new Error(`HTTP ${response.status}: ${response.statusText}`),
        }
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  /**
   * Fetches the file content as UTF-8 text.
   * @returns The file content as a string
   * @throws Error if the fetch fails
   */
  async text(): Promise<string> {
    const buf = await this.buffer();
    return new TextDecoder().decode(buf);
  }

  /**
   * Fetches the file content as a Blob.
   * @returns The file content as a Blob
   * @throws RemoteFileDownloadError if the fetch fails
   */
  async blob(): Promise<Blob> {
    const response = await fetch(this.downloadUrl);
    if (!response.ok) {
      throw new RemoteFileDownloadError(
        `Failed to download file: ${response.status} ${response.statusText}`,
        {
          statusCode: response.status,
          statusText: response.statusText,
          downloadUrl: this.downloadUrl,
          mountRelativePath: this.mountRelativePath,
          filename: this.filename,
          cause: new Error(`HTTP ${response.status}: ${response.statusText}`),
        }
      );
    }
    return response.blob();
  }

  /**
   * Downloads and saves the file to the local filesystem.
   * Requires a Node.js runtime with file system support (not available in Cloudflare Workers/Edge).
   *
   * @param path - Local path to save the file. If omitted, saves to the Composio temp directory using the filename from the mount path.
   * @returns The absolute path where the file was saved
   * @throws Error if file system is not supported or the save fails
   */
  async save(path?: string): Promise<string> {
    if (!platform.supportsFileSystem) {
      throw new Error(
        'File system operations are not supported in this runtime (e.g. Cloudflare Workers). ' +
          'Use buffer(), text(), or blob() to work with the file content in memory, or run in Node.js.'
      );
    }

    const content = await this.buffer();
    const homeDir = platform.homedir();
    if (!homeDir) {
      throw new Error('Cannot determine save location: home directory is not available');
    }

    const savePath =
      path ?? platform.joinPath(homeDir, COMPOSIO_DIR, TEMP_FILES_DIRECTORY_NAME, this.filename);

    const dir =
      path != null
        ? getParentDir(savePath)
        : platform.joinPath(homeDir, COMPOSIO_DIR, TEMP_FILES_DIRECTORY_NAME);
    if (dir && !platform.existsSync(dir)) {
      platform.mkdirSync(dir);
    }

    platform.writeFileSync(savePath, content);
    return savePath;
  }
}
