/**
 * @fileoverview Files class for Composio SDK, used to manage files.
 *
 * @author Musthaq Ahamad <musthaq@composio.dev>
 * @date 2025-06-23
 * @module Files
 */
import ComposioClient from '@composio/client';
import { FileDownloadData, FileUploadData } from '../types/files.types';
import { ComposioRequestOptions } from '../types/requestOptions.types';
import { downloadFileFromS3, getFileDataAfterUploadingToS3 } from '../utils/fileUtils.node';
import { withCancellation } from '../utils/cancellation';
import { telemetry } from '../telemetry/Telemetry';

export class Files {
  private readonly fileOptions: {
    sensitiveFileUploadProtection?: boolean;
    fileUploadPathDenySegments?: string[];
    fileDownloadDir?: string;
  };

  constructor(
    private readonly client: ComposioClient,
    fileOptions: {
      sensitiveFileUploadProtection?: boolean;
      fileUploadPathDenySegments?: string[];
      fileDownloadDir?: string;
    } = {}
  ) {
    this.fileOptions = fileOptions;
    telemetry.instrument(this, 'Files');
  }

  /**
   * Upload a file and return the file data.
   *
   * @param params - The upload parameters.
   * @param {File | string} params.file - The path to the file to upload, a URL of the file, or a File object.
   * @param {string} params.toolSlug - The slug of the tool that is uploading the file.
   * @param {string} params.toolkitSlug - The slug of the toolkit that is uploading the file.
   * @param {ComposioRequestOptions} [requestOptions] - Optional request options. `signal` cancels
   *   the file read from a URL, the presigned-URL request, and the S3 transfer; the call then
   *   rejects with {@link ComposioRequestCancelledError}.
   * @returns {Promise<FileUploadData>} The uploaded file data.
   *
   * @example
   *
   * const fileData = await composio.files.upload(
   *   {
   *     file: 'path/to/file.pdf',
   *     toolSlug: 'google_drive_upload',
   *     toolkitSlug: 'google_drive',
   *   },
   *   { signal: AbortSignal.timeout(30_000) }
   * );
   * */
  async upload(
    {
      file,
      toolSlug,
      toolkitSlug,
    }: {
      file: File | string;
      toolSlug: string;
      toolkitSlug: string;
    },
    requestOptions?: ComposioRequestOptions
  ): Promise<FileUploadData> {
    const signal = requestOptions?.signal;
    // Note: manual `composio.files.upload()` intentionally skips the
    // `fileUploadDirs` allowlist. The allowlist only gates *automatic* upload
    // during tool execution (see FileToolModifier).
    return withCancellation(
      () =>
        getFileDataAfterUploadingToS3(file, {
          toolSlug,
          toolkitSlug,
          client: this.client,
          sensitiveFileUploadProtection: this.fileOptions.sensitiveFileUploadProtection,
          fileUploadPathDenySegments: this.fileOptions.fileUploadPathDenySegments,
          signal,
        }),
      signal
    );
  }

  /**
   * Download a file from S3 and return the file data.
   *
   * @param params - The download parameters.
   * @param {string} params.s3Url - The S3 URL of the file to download.
   * @param {string} params.toolSlug - The slug of the tool the file belongs to, used as the file name prefix.
   * @param {string} params.mimeType - The MIME type of the file, used to pick the file extension.
   * @param {ComposioRequestOptions} [requestOptions] - Optional request options. `signal` cancels
   *   the download before the file is written; the call then rejects with
   *   {@link ComposioRequestCancelledError}.
   * @returns {Promise<FileDownloadData>} The downloaded file data.
   */
  async download(
    {
      toolSlug,
      s3Url,
      mimeType,
    }: {
      s3Url: string;
      toolSlug: string;
      mimeType: string;
    },
    requestOptions?: ComposioRequestOptions
  ): Promise<FileDownloadData> {
    const signal = requestOptions?.signal;
    return withCancellation(
      () =>
        downloadFileFromS3({
          toolSlug,
          s3Url,
          mimeType,
          fileDownloadDir: this.fileOptions.fileDownloadDir,
          signal,
        }),
      signal
    );
  }
}
