import { telemetry } from '../telemetry/Telemetry';
import { Composio as ComposioClient } from '@composio/client';
import {
  FileDeleteResponse,
  FileDeleteResponseSchema,
  FileListResponse,
  FileListResponseSchema,
  RemoteFileDataSchema,
  ToolRouterSessionFilesMountDeleteOptions,
  ToolRouterSessionFilesMountDeleteOptionsSchema,
  ToolRouterSessionFilesMountDownloadOptions,
  ToolRouterSessionFilesMountDownloadOptionsSchema,
  ToolRouterSessionFilesMountListOptions,
  ToolRouterSessionFilesMountListOptionsSchema,
  ToolRouterSessionFilesMountUploadOptions,
  ToolRouterSessionFilesMountUploadOptionsSchema,
} from '../types/ToolRouterSessionFilesMount.types';
import { RemoteFile } from './RemoteFile';
import { ValidationError } from '../errors';
import { platform } from '#platform';
import { getExtensionFromMimeType } from '../utils/mime';
import { getRandomShortId } from '../utils/uuid';

export class ToolRouterSessionFilesMount {
  private readonly sessionId: string;
  private readonly client: ComposioClient;

  constructor(client: ComposioClient, sessionId: string) {
    this.client = client;
    this.sessionId = sessionId;
    telemetry.instrument(this, 'ToolRouterSessionFiles');
  }

  /**
   * Lists files and directories at the specified path on the session's file mount.
   *
   * Use this to browse the virtual filesystem attached to the tool router session.
   * The path is relative to the mount root (e.g., `"/"` for root, `"/documents"` for a subdirectory).
   * Supports cursor-based pagination via `cursor` and `limit` options.
   *
   * @param options - Optional configuration for the list operation.
   * @param options.path - The directory path to list. Use `"/"` for the mount root.
   * @param options.mountId - The ID of the file mount to operate on. Defaults to `"files"` when omitted.
   * @param options.cursor - Pagination cursor from the previous response's nextCursor field.
   * @param options.limit - Maximum number of files to return per page (1-500).
   * @returns List of files with nextCursor for pagination.
   *
   * @example
   * ```typescript
   * const session = await composio.toolRouter.use('session_123');
   * const { items, nextCursor } = await session.files.list({ path: '/' });
   * ```
   *
   * @example
   * ```typescript
   * // Paginated listing
   * let result = await session.files.list({ path: '/', limit: 10 });
   * while (result.nextCursor) {
   *   result = await session.files.list({ path: '/', cursor: result.nextCursor, limit: 10 });
   * }
   * ```
   */
  async list(options?: ToolRouterSessionFilesMountListOptions): Promise<FileListResponse> {
    const listOptions = ToolRouterSessionFilesMountListOptionsSchema.safeParse(options ?? {});

    if (!listOptions.success) {
      throw new ValidationError('Failed to parse tool router session files mount list options', {
        cause: listOptions.error,
      });
    }

    // API requires: no leading slash, min 1 char when provided. Omit for root.
    const rawPath = listOptions.data.path;
    const mountRelativePrefix =
      rawPath === undefined || rawPath === '' || rawPath === '/'
        ? undefined
        : rawPath.startsWith('/')
          ? rawPath.slice(1)
          : rawPath;

    const response = await this.client.toolRouter.session.files.list(listOptions.data.mountId, {
      session_id: this.sessionId,
      mount_relative_prefix: mountRelativePrefix,
      cursor: listOptions.data.cursor,
      limit: listOptions.data.limit,
    });

    const data =
      typeof response === 'object' && 'body' in response
        ? (response as { body: unknown }).body
        : response;

    const parsed = FileListResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw new ValidationError('Failed to parse file list response', {
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  private async normalizeUploadInput(
    input: string | File | ArrayBuffer | Uint8Array,
    options: { remotePath?: string; mimetype?: string }
  ): Promise<{ fileToUpload: File; remotePath: string; mimetype: string }> {
    if (typeof input === 'string') {
      if (input.startsWith('http://') || input.startsWith('https://')) {
        const response = await fetch(input);
        if (!response.ok) {
          throw new Error(`Failed to fetch file from URL: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const mimeType = response.headers.get('content-type') || 'application/octet-stream';
        const url = new URL(input);
        const pathname = url.pathname;
        const segments = pathname.split('/').filter(Boolean);
        let filename = segments.length > 0 ? segments[segments.length - 1] : '';
        if (!filename || !filename.includes('.')) {
          const extension = getExtensionFromMimeType(mimeType);
          filename = `${getRandomShortId()}.${extension}`;
        }
        const file = new File([arrayBuffer], filename, { type: mimeType });
        return {
          fileToUpload: file,
          remotePath: options.remotePath ?? filename,
          mimetype: mimeType,
        };
      }
      const content = platform.readFileSync(input);
      const buffer =
        content instanceof Uint8Array
          ? new Uint8Array(content)
          : new TextEncoder().encode(content as string);
      const filename = platform.basename(input);
      const mimetype = options.mimetype ?? 'application/octet-stream';
      const file = new File([buffer], filename, { type: mimetype });
      return {
        fileToUpload: file,
        remotePath: options.remotePath ?? filename,
        mimetype,
      };
    }

    if (input instanceof File) {
      return {
        fileToUpload: input,
        remotePath: options.remotePath ?? (input.name || `upload-${getRandomShortId()}.bin`),
        mimetype: input.type || 'application/octet-stream',
      };
    }

    const buffer = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
    if (!options.mimetype && !options.remotePath) {
      throw new Error(
        'When passing a buffer, either mimetype or remotePath (filename) is required. ' +
          'Example: files.upload(buffer, { remotePath: "data.json", mimetype: "application/json" })'
      );
    }
    const mimetype = options.mimetype ?? 'application/octet-stream';
    const ext = getExtensionFromMimeType(mimetype);
    const remotePath = options.remotePath ?? `upload-${getRandomShortId()}.${ext}`;
    const file = new File([buffer as BlobPart], remotePath, { type: mimetype });
    return {
      fileToUpload: file,
      remotePath,
      mimetype,
    };
  }

  /**
   * Uploads a file to the session's file mount.
   *
   * Accepts a file path (local or URL), a native File object, or a raw buffer.
   * The file is stored in the virtual filesystem associated with the tool router session.
   *
   * @param input - File path (string), native File, or raw buffer (ArrayBuffer | Uint8Array).
   * @param options - Optional configuration. When passing a buffer, remotePath is required.
   * @returns Metadata about the uploaded file.
   *
   * @example
   * ```typescript
   * // From file path (local or URL)
   * await session.files.upload('/path/to/report.pdf');
   * await session.files.upload('https://example.com/file.pdf');
   * ```
   *
   * @example
   * ```typescript
   * // From native File (e.g. from input[type=file])
   * await session.files.upload(fileInput.files[0]);
   * ```
   *
   * @example
   * ```typescript
   * // From raw buffer
   * await session.files.upload(buffer, { remotePath: 'data.json', mimetype: 'application/json' });
   * ```
   */
  async upload(
    input: string | File | ArrayBuffer | Uint8Array,
    options?: ToolRouterSessionFilesMountUploadOptions
  ): Promise<RemoteFile> {
    const uploadOptions = ToolRouterSessionFilesMountUploadOptionsSchema.safeParse(options ?? {});

    if (!uploadOptions.success) {
      throw new ValidationError('Failed to parse tool router session files mount upload options', {
        cause: uploadOptions.error,
      });
    }

    const { fileToUpload, remotePath, mimetype } = await this.normalizeUploadInput(
      input,
      uploadOptions.data
    );

    const createUploadURLResponse = await this.client.toolRouter.session.files.createUploadURL(
      uploadOptions.data.mountId,
      {
        session_id: this.sessionId,
        mount_relative_path: remotePath,
        mimetype,
      }
    );

    const uploadURLData =
      typeof createUploadURLResponse === 'object' && 'body' in createUploadURLResponse
        ? (createUploadURLResponse as { body: unknown }).body
        : createUploadURLResponse;

    const uploadResponse = await fetch((uploadURLData as { upload_url: string }).upload_url, {
      method: 'PUT',
      body: await fileToUpload.arrayBuffer(),
      headers: {
        'Content-Type': mimetype,
      },
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload file: ${uploadResponse.statusText}`);
    }

    const createDownloadURLResponse = await this.client.toolRouter.session.files.createDownloadURL(
      uploadOptions.data.mountId,
      {
        session_id: this.sessionId,
        mount_relative_path: (uploadURLData as { mount_relative_path: string }).mount_relative_path,
      }
    );

    const downloadData =
      typeof createDownloadURLResponse === 'object' && 'body' in createDownloadURLResponse
        ? (createDownloadURLResponse as { body: unknown }).body
        : createDownloadURLResponse;

    const parsed = RemoteFileDataSchema.safeParse(downloadData);
    if (!parsed.success) {
      throw new ValidationError('Failed to parse remote file properties', {
        cause: parsed.error,
      });
    }

    return new RemoteFile(parsed.data);
  }

  /**
   * Downloads a file from the session's file mount to the local filesystem.
   *
   * Retrieves a file stored in the session's virtual filesystem (e.g., one produced
   * by a tool or previously uploaded) and saves it to the specified local path.
   *
   * @param filePath - The path of the file on the mount to download, or the local path where the file should be saved (implementation-specific).
   * @param options - Optional configuration for the download.
   * @param options.mountId - The ID of the file mount to download from. Defaults to `"files"` when omitted.
   * @returns The downloaded file data or path (implementation-specific).
   *
   * @example
   * ```typescript
   * const session = await composio.toolRouter.use('session_123');
   * const result = await session.files.download('/output/report.pdf');
   * ```
   *
   * @example
   * ```typescript
   * // Download from a custom mount
   * await session.files.download('/exports/data.json', {
   *   mountId: 'custom-mount',
   * });
   * ```
   */
  async download(
    filePath: string,
    options?: ToolRouterSessionFilesMountDownloadOptions
  ): Promise<RemoteFile> {
    const downloadOptions = ToolRouterSessionFilesMountDownloadOptionsSchema.safeParse(
      options ?? {}
    );

    if (!downloadOptions.success) {
      throw new ValidationError(
        'Failed to parse tool router session files mount download options',
        {
          cause: downloadOptions.error,
        }
      );
    }

    const createDownloadURLResponse = await this.client.toolRouter.session.files.createDownloadURL(
      downloadOptions.data.mountId,
      {
        session_id: this.sessionId,
        mount_relative_path: filePath,
      }
    );

    const downloadURLData =
      typeof createDownloadURLResponse === 'object' && 'body' in createDownloadURLResponse
        ? (createDownloadURLResponse as { body: unknown }).body
        : createDownloadURLResponse;

    const parsed = RemoteFileDataSchema.safeParse(downloadURLData);
    if (!parsed.success) {
      throw new ValidationError('Failed to parse remote file properties', {
        cause: parsed.error,
      });
    }
    return new RemoteFile(parsed.data);
  }

  /**
   * Deletes a file or directory at the specified path on the session's file mount.
   *
   * Removes the file or directory from the virtual filesystem. Use with caution:
   * deletion is typically irreversible. Ensure the path exists and is intended for removal.
   *
   * @param remotePath - The path of the file or directory to delete on the mount.
   * @param options - Optional configuration for the delete operation.
   * @param options.mountId - The ID of the file mount to operate on. Defaults to `"files"` when omitted.
   * @returns Confirmation of deletion (implementation-specific).
   *
   * @example
   * ```typescript
   * const session = await composio.toolRouter.use('session_123');
   * await session.files.delete('/temp/cache.json');
   * ```
   *
   * @example
   * ```typescript
   * // Delete from a custom mount
   * await session.files.delete('/old-backup', {
   *   mountId: 'custom-mount',
   * });
   * ```
   *
   * @warning This operation is destructive. Deleted files cannot be recovered.
   */
  async delete(
    remotePath: string,
    options?: ToolRouterSessionFilesMountDeleteOptions
  ): Promise<FileDeleteResponse> {
    const deleteOptions = ToolRouterSessionFilesMountDeleteOptionsSchema.safeParse(options ?? {});

    if (!deleteOptions.success) {
      throw new ValidationError('Failed to parse tool router session files mount delete options', {
        cause: deleteOptions.error,
      });
    }

    const deleteResponse = await this.client.toolRouter.session.files.delete(
      deleteOptions.data.mountId,
      {
        session_id: this.sessionId,
        mount_relative_path: remotePath,
      }
    );
    const fileDeleteResponse = FileDeleteResponseSchema.safeParse(deleteResponse);
    if (!fileDeleteResponse.success) {
      throw new ValidationError('Failed to parse file delete response', {
        cause: fileDeleteResponse.error,
      });
    }
    return fileDeleteResponse.data;
  }
}
