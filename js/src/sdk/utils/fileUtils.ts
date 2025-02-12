import { COMPOSIO_DIR, TEMP_FILES_DIRECTORY_NAME } from "./constants";

/**
 * Gets the Composio directory.
 * @param createDirIfNotExists - Whether to create the directory if it doesn't exist.
 * @returns The path to the Composio directory.
 */
export const getComposioDir = (createDirIfNotExists: boolean = false) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require("os");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
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
export const getComposioTempFilesDir = (
  createDirIfNotExists: boolean = false
) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require("os");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    const composioFilesDir = path.join(
      os.homedir(),
      COMPOSIO_DIR,
      TEMP_FILES_DIRECTORY_NAME
    );
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
 * @param content - The content of the file to save. Should be a string.
 * @param isTempFile - Whether the file is a temporary file.
 * @returns The path to the saved file.
 */
export const saveFile = (
  file: string,
  content: string,
  isTempFile: boolean = false
) => {
  try {
    const path = require("path");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    const composioFilesDir = isTempFile
      ? getComposioTempFilesDir(true)
      : getComposioDir(true);
    const filePath = path.join(composioFilesDir, path.basename(file));

    if (Buffer.isBuffer(content)) {
      fs.writeFileSync(filePath, content);
    } else {
      fs.writeFileSync(filePath, content, "utf8");
    }

    return filePath;
  } catch (_error) {
    return null;
  }
};
