import * as path from "path";
import * as os from "os";

import * as fs from "fs";
import { COMPOSIO_DIR, TEMP_FILES_DIRECTORY_NAME } from "./constants";

/**
 * Gets the Composio directory.
 * @param createDirIfNotExists - Whether to create the directory if it doesn't exist.
 * @returns The path to the Composio directory.
 */
export const getComposioDir = (createDirIfNotExists: boolean = false) => {
  const composioDir = path.join(os.homedir(), COMPOSIO_DIR);
  if (createDirIfNotExists && !fs.existsSync(composioDir)) {
    fs.mkdirSync(composioDir, { recursive: true });
  }
  return composioDir;
};

/**
 * Gets the Composio temporary files directory.
 * @param createDirIfNotExists - Whether to create the directory if it doesn't exist.
 * @returns The path to the Composio temporary files directory.
 */
export const getComposioTempFilesDir = (
  createDirIfNotExists: boolean = false
) => {
  const composioFilesDir = path.join(
    os.homedir(),
    COMPOSIO_DIR,
    TEMP_FILES_DIRECTORY_NAME
  );
  if (createDirIfNotExists && !fs.existsSync(composioFilesDir)) {
    fs.mkdirSync(composioFilesDir, { recursive: true });
  }
  return composioFilesDir;
};

/**
 * Saves a file to the Composio directory.
 * @param file - The name of the file to save.
 * @param content - The content of the file to save. Should be a string.
 * @param isTempFile - Whether the file is a temporary file.
 * @returns The path to the saved file.
 */
export const saveFile = (
  file: string,
  content: string,
  isTempFile: boolean = false
) => {
  const composioFilesDir = isTempFile
    ? getComposioTempFilesDir(true)
    : getComposioDir(true);
  const filePath = path.join(composioFilesDir, path.basename(file));
  fs.writeFileSync(filePath, content);

  return filePath;
};
