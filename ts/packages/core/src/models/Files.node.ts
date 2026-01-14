/**
 * @fileoverview Files class for Composio SDK, used to manage files.
 *
 * @author Musthaq Ahamad <musthaq@composio.dev>
 * @date 2025-06-23
 * @module Files
 */
import ComposioClient from '@composio/client';
import { FileDownloadData, FileUploadData } from '../types/files.types';
import { downloadFileFromS3, getFileDataAfterUploadingToS3 } from '../utils/fileUtils';
import { telemetry } from '../telemetry/Telemetry';

export class Files {
  constructor(private readonly client: ComposioClient) {
    telemetry.instrument(this, 'Files');
  }

  /**
   * Upload a file to S3 and return the file data.
   * @param filePath - The path to the file to upload or a URL of the file to upload.
   * @param toolSlug - The slug of the tool that is uploading the file.
   * @param toolkitSlug - The slug of the toolkit that is uploading the file.
   * @returns The file data.
   */
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
