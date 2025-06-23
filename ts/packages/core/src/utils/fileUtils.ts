import crypto from 'crypto';
import pathModule from 'path';
import ComposioClient from '@composio/client';
import { COMPOSIO_DIR, TEMP_FILES_DIRECTORY_NAME } from './constants';
import logger from './logger';
import { FileDownloadData, FileUploadData } from '../types/files.types';

const readFileContent = async (
  path: string
): Promise<{ fileName: string; content: string; mimeType: string }> => {
  try {
    const content = require('fs').readFileSync(path);
    return {
      fileName: path,
      content: content.toString('base64'),
      mimeType: 'application/octet-stream',
    };
  } catch (error) {
    throw new Error(`Error reading file at ${path}: ${error}`);
  }
};

const readFileContentFromURL = async (
  path: string
): Promise<{ fileName: string; content: string; mimeType: string }> => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const content = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get('content-type') || 'application/octet-stream';
  return {
    content: content.toString('base64'),
    mimeType,
    fileName: path,
  };
};

const uploadFileToS3 = async (
  fileName: string,
  content: string,
  toolSlug: string,
  toolkitSlug: string,
  mimeType: string,
  client: ComposioClient
): Promise<string> => {
  const response = await client.files.createPresignedURL({
    filename: fileName,
    mimetype: mimeType,
    md5: crypto.createHash('md5').update(Buffer.from(content, 'base64')).digest('hex'),
    tool_slug: toolSlug,
    toolkit_slug: toolkitSlug,
  });

  const { key, type } = response;

  if (type === 'new' || type === 'update') {
    logger.debug(`Uploading ${key} file to S3: ${key}`);
    const buffer = Buffer.from(content, 'base64');
    const signedURL =
      response.type === 'update' ? response.update_presigned_url : response.new_presigned_url;

    // Upload the file using the presigned URL
    const uploadResponse = await fetch(signedURL, {
      method: 'PUT',
      body: buffer,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': buffer.length.toString(),
      },
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload file to S3: ${uploadResponse.statusText}`);
    }
  } else {
    logger.debug(`File already exists in S3: ${key}`);
  }

  return key;
};

const readFile = async (
  file: File | string
): Promise<{ fileName: string; content: string; mimeType: string }> => {
  if (file instanceof File) {
    // if file is a File, read the content from the file
    const content = await file.arrayBuffer();
    return {
      fileName: file.name,
      content: Buffer.from(content).toString('base64'),
      mimeType: file.type,
    };
  } else if (typeof file === 'string') {
    if (file.startsWith('http')) {
      return await readFileContentFromURL(file);
    } else {
      return await readFileContent(file);
    }
  }
  throw new Error('Invalid file type');
};

export const getFileDataAfterUploadingToS3 = async (
  file: File | string,
  {
    toolSlug,
    toolkitSlug,
    client,
  }: {
    toolSlug: string;
    toolkitSlug: string;
    client: ComposioClient;
  }
): Promise<FileUploadData> => {
  if (!file) {
    throw new Error('Either path or blob must be provided');
  }

  const fileData = await readFile(file);
  logger.debug(`Uploading file to S3...`);
  const s3key = await uploadFileToS3(
    pathModule.basename(fileData.fileName),
    fileData.content,
    toolSlug,
    toolkitSlug,
    fileData.mimeType,
    client
  );

  logger.debug(`Done! File uploaded to S3: ${s3key}`, JSON.stringify(fileData, null, 2));
  return {
    name: fileData.fileName,
    mimetype: fileData.mimeType,
    s3key: s3key,
  };
};

export const downloadFileFromS3 = async ({
  toolSlug,
  s3Url,
  mimeType,
}: {
  toolSlug: string;
  s3Url: string;
  mimeType: string;
}): Promise<FileDownloadData> => {
  const response = await fetch(s3Url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  const data = await response.arrayBuffer();

  const extension = mimeType.split('/')[1] || 'txt';
  const fileName = `${toolSlug}_${Date.now()}.${extension}`;
  const filePath = saveFile(fileName, Buffer.from(data), true);
  return {
    name: fileName,
    mimeType: mimeType,
    s3Url: s3Url,
    filePath: filePath,
  };
};

/**
 * Gets the Composio directory.
 * @param createDirIfNotExists - Whether to create the directory if it doesn't exist.
 * @returns The path to the Composio directory.
 */
export const getComposioDir = (createDirIfNotExists: boolean = false) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require('os');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    const composioDir = path.join(os.homedir(), COMPOSIO_DIR);
    if (createDirIfNotExists && !fs.existsSync(composioDir)) {
      fs.mkdirSync(composioDir, { recursive: true });
    }
    return composioDir;
  } catch (_error) {
    return null;
  }
};

/**
 * Gets the Composio temporary files directory.
 * @param createDirIfNotExists - Whether to create the directory if it doesn't exist.
 * @returns The path to the Composio temporary files directory.
 */
export const getComposioTempFilesDir = (createDirIfNotExists: boolean = false) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require('os');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    const composioFilesDir = path.join(os.homedir(), COMPOSIO_DIR, TEMP_FILES_DIRECTORY_NAME);
    if (createDirIfNotExists && !fs.existsSync(composioFilesDir)) {
      fs.mkdirSync(composioFilesDir, { recursive: true });
    }
    return composioFilesDir;
  } catch (_error) {
    return null;
  }
};

/**
 * Saves a file to the Composio directory.
 * @param file - The name of the file to save.
 * @param content - The content of the file to save. Can be a string or Buffer.
 * @param isTempFile - Whether the file is a temporary file.
 * @returns The path to the saved file.
 */
export const saveFile = (file: string, content: string | Buffer, isTempFile: boolean = false) => {
  try {
    const path = require('path');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    const composioFilesDir = isTempFile ? getComposioTempFilesDir(true) : getComposioDir(true);
    const filePath = path.join(composioFilesDir, path.basename(file));

    logger.info(`Saving file to: ${filePath}`);

    if (Buffer.isBuffer(content)) {
      fs.writeFileSync(filePath, content);
    } else {
      fs.writeFileSync(filePath, content, 'utf8');
    }

    return filePath;
  } catch (_error) {
    logger.debug(`Error saving file: ${_error}`);
    return null;
  }
};
