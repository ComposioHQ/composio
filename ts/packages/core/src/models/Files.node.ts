/**
 * @fileoverview Files class for Composio SDK, used to manage files.
 *
 * @author Musthaq Ahamad <musthaq@composio.dev>
 * @date 2025-06-23
 * @module Files
 */
import ComposioClient from '@composio/client';
import { FileDownloadData, FileUploadData } from '../types/files.types';
import { downloadFileFromS3, getFileDataAfterUploadingToS3 } from '../utils/fileUtils.node';
import { telemetry } from '../telemetry/Telemetry';

export class Files {
  private readonly fileUploadPathOptions: {
    sensitiveFileUploadProtection?: boolean;
    fileUploadPathDenySegments?: string[];
  };

  constructor(
    private readonly client: ComposioClient,
    fileUploadPathOptions: {
      sensitiveFileUploadProtection?: boolean;
      fileUploadPathDenySegments?: string[];
    } = {}
  ) {
    this.fileUploadPathOptions = fileUploadPathOptions;
    telemetry.instrument(this, 'Files');
  }

  /**
   * Upload a file and return the file data.
   *
   * @param params - The upload parameters.
   * @param {File | string} params.file - The path to the file to upload, a URL of the file, or a File object.
   * @param {string} params.toolSlug - The slug of the tool that is uploading the file.
   * @param {string} params.toolkitSlug - The slug of the toolkit that is uploading the file.
   * @returns {Promise<FileUploadData>} The uploaded file data.
   *
   * @example
   *
   * const fileData = await composio.files.upload({
   *   file: 'path/to/file.pdf',
   *   toolSlug: 'google_drive_upload',
   *   toolkitSlug: 'google_drive'
   * });
   * */
  async upload({
    file,
    toolSlug,
    toolkitSlug,
  }: {
    file: File | string;
    toolSlug: string;
    toolkitSlug: string;
  }): Promise<FileUploadData> {
    const fileData = await getFileDataAfterUploadingToS3(file, {
      toolSlug,
      toolkitSlug,
      client: this.client,
      sensitiveFileUploadProtection: this.fileUploadPathOptions.sensitiveFileUploadProtection,
      fileUploadPathDenySegments: this.fileUploadPathOptions.fileUploadPathDenySegments,
    });
    return fileData;
  }

  /**
   * Download a file from S3 and return the file data.
   * @param s3key - The S3 key of the file to download.
   * @returns The file data.
   */
  async download({
    toolSlug,
    s3Url,
    mimeType,
  }: {
    s3Url: string;
    toolSlug: string;
    mimeType: string;
  }): Promise<FileDownloadData> {
    const fileDownloadData = await downloadFileFromS3({ toolSlug, s3Url, mimeType });
    return fileDownloadData;
  }
}
