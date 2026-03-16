/* eslint-disable-next-line no-restricted-imports */
import crypto from 'node:crypto'; // we're in a Node.js-specific module
import { platform } from '#platform';
import ComposioClient from '@composio/client';
import { COMPOSIO_DIR, TEMP_FILES_DIRECTORY_NAME } from './constants';
import logger from './logger';
import { getRandomShortId } from './uuid';
import { base64ToUint8Array, uint8ArrayToBase64 } from './buffer';
import type { FileDownloadData, FileUploadData } from '../types/files.types';

// Helper function to get file extension from MIME type
const getExtensionFromMimeType = (mimeType: string): string => {
  const mimeToExt: Record<string, string> = {
    'text/plain': 'txt',
    'text/html': 'html',
    'text/css': 'css',
    'text/javascript': 'js',
    'application/json': 'json',
    'application/xml': 'xml',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'application/gzip': 'gz',
    'application/x-tar': 'tar',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'video/mp4': 'mp4',
    'video/mpeg': 'mpeg',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    'video/webm': 'webm',
  };

  // Clean the MIME type by removing parameters (e.g., "text/plain; charset=utf-8" -> "text/plain")
  const cleanMimeType = mimeType.split(';')[0].toLowerCase().trim();

  // Try exact match first
  if (mimeToExt[cleanMimeType]) {
    return mimeToExt[cleanMimeType];
  }

  // Try to extract from the MIME type (e.g., "image/png" -> "png")
  const parts = cleanMimeType.split('/');
  if (parts.length === 2) {
    const subtype = parts[1].toLowerCase();
    const cleanSubtype = subtype; // Already cleaned above

    // Handle structured MIME types with + (e.g., "application/vnd.api+json" -> "json")
    if (cleanSubtype.includes('+')) {
      const plusParts = cleanSubtype.split('+');
      const prefix = plusParts[0];
      const suffix = plusParts[plusParts.length - 1]; // Get the part after the last +

      // For specific formats, prefer the prefix (e.g., "atom+xml" -> "atom")
      const knownPrefixes = ['svg', 'atom', 'rss'];
      if (knownPrefixes.includes(prefix)) {
        return prefix;
      }

      // For common structured suffixes, use the suffix (e.g., "vnd.api+json" -> "json")
      const structuredSuffixes = ['json', 'xml', 'yaml', 'zip', 'gzip'];
      if (structuredSuffixes.includes(suffix)) {
        return suffix;
      }

      // Default to the suffix for other structured types
      return suffix;
    }

    return cleanSubtype || 'txt';
  }

  return 'txt'; // Default fallback
};

// Helper function to generate a filename with timestamp and random ID
const generateTimestampedFilename = (extension: string, prefix?: string): string => {
  const basePrefix = prefix || 'file_ts';
  return `${basePrefix}${Date.now()}${getRandomShortId()}.${extension}`;
};

const readFileContent = async (
  filePath: string
): Promise<{ fileName: string; content: string; mimeType: string }> => {
  try {
    if (!platform.supportsFileSystem) {
      throw new Error('File system operations are not supported in this runtime environment');
    }
    const content = platform.readFileSync(filePath);
    return {
      fileName: generateTimestampedFilename(filePath.split('.').pop() || 'txt'),
      content:
        content instanceof Uint8Array
          ? uint8ArrayToBase64(content)
          : uint8ArrayToBase64(new TextEncoder().encode(content)),
      mimeType: 'application/octet-stream',
    };
  } catch (error) {
    throw new Error(`Error reading file at ${filePath}: ${error}`);
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
  const content = new Uint8Array(arrayBuffer);
  const mimeType = response.headers.get('content-type') || 'application/octet-stream';

  // Extract clean filename from URL, removing query parameters
  const url = new URL(path);
  const pathname = url.pathname;
  let fileName = platform.basename(pathname);

  // If no filename from URL, generate one with appropriate extension
  if (!fileName || fileName === '/') {
    // Try to get extension from mimeType
    const extension = getExtensionFromMimeType(mimeType);
    fileName = generateTimestampedFilename(extension);
  } else {
    // If filename has no extension, try to add one from mimeType
    const hasExtension = fileName.includes('.');
    if (!hasExtension) {
      const extension = getExtensionFromMimeType(mimeType);
      fileName = generateTimestampedFilename(extension);
    }
  }

  return {
    content: uint8ArrayToBase64(content),
    mimeType,
    fileName,
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
  const contentBytes = base64ToUint8Array(content);
  const response = await client.files.createPresignedURL({
    filename: fileName,
    mimetype: mimeType,
    md5: crypto.createHash('md5').update(contentBytes).digest('hex'),
    tool_slug: toolSlug,
    toolkit_slug: toolkitSlug,
  });

  const { key, new_presigned_url: signedURL } = response;

  // Upload file using presigned URL
  // Note: API now always returns type: 'new' with new_presigned_url
  logger.debug(`Uploading ${key} file to S3: ${key}`);

  // Create a new ArrayBuffer to ensure compatibility with fetch API
  const uploadBuffer = new Uint8Array(contentBytes.byteLength);
  uploadBuffer.set(contentBytes);

  const uploadResponse = await fetch(signedURL, {
    method: 'PUT',
    body: uploadBuffer,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': contentBytes.length.toString(),
    },
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload file to S3: ${uploadResponse.statusText}`);
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
      content: uint8ArrayToBase64(new Uint8Array(content)),
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
    platform.basename(fileData.fileName),
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

  const extension = getExtensionFromMimeType(mimeType);
  const fileName = generateTimestampedFilename(extension, `${toolSlug}_`);
  const filePath = saveFile(fileName, new Uint8Array(data), true);
  return {
    name: fileName,
    mimeType: mimeType,
    s3Url: s3Url,

    /**
     * @todo: fix in follow-up PR.
     */
    filePath: filePath as string,
  };
};

/**
 * Gets the Composio directory.
 * @param createDirIfNotExists - Whether to create the directory if it doesn't exist.
 * @returns The path to the Composio directory.
 */
export const getComposioDir = (createDirIfNotExists: boolean = false) => {
  try {
    const homeDir = platform.homedir();
    if (!homeDir) {
      return null;
    }
    const composioDir = platform.joinPath(homeDir, COMPOSIO_DIR);
    if (createDirIfNotExists && platform.supportsFileSystem && !platform.existsSync(composioDir)) {
      platform.mkdirSync(composioDir);
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
    const homeDir = platform.homedir();
    if (!homeDir) {
      return null;
    }
    const composioFilesDir = platform.joinPath(homeDir, COMPOSIO_DIR, TEMP_FILES_DIRECTORY_NAME);
    if (
      createDirIfNotExists &&
      platform.supportsFileSystem &&
      !platform.existsSync(composioFilesDir)
    ) {
      platform.mkdirSync(composioFilesDir);
    }
    return composioFilesDir;
  } catch (_error) {
    return null;
  }
};

/**
 * Saves a file to the Composio directory.
 * @param file - The name of the file to save.
 * @param content - The content of the file to save. Can be a string or Uint8Array.
 * @param isTempFile - Whether the file is a temporary file.
 * @returns The path to the saved file.
 */
export const saveFile = (
  file: string,
  content: string | Uint8Array,
  isTempFile: boolean = false
) => {
  try {
    if (!platform.supportsFileSystem) {
      logger.debug('File system operations are not supported in this runtime environment');
      return null;
    }
    const composioFilesDir = isTempFile ? getComposioTempFilesDir(true) : getComposioDir(true);
    if (!composioFilesDir) {
      return null;
    }
    const filePath = platform.joinPath(composioFilesDir, platform.basename(file));

    logger.info(`Saving file to: ${filePath}`);

    if (content instanceof Uint8Array) {
      platform.writeFileSync(filePath, content);
    } else {
      platform.writeFileSync(filePath, content, 'utf8');
    }

    return filePath;
  } catch (_error) {
    logger.debug(`Error saving file: ${_error}`);
    return null;
  }
};
