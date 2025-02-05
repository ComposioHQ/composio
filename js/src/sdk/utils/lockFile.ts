import logger from "../../utils/logger";

export const updateLockFileWithActionVersion = (
  filePath: string,
  actionName: string,
  version: string
) => {
  const actionVersions = getVersionsFromLockFileAsJson(filePath);
  actionVersions[actionName] = version;
  saveLockFile(filePath, actionVersions);
};

export const getVersionsFromLockFileAsJson = (filePath: string) => {
  try {
    const lockFileContent = require("fs").readFileSync(filePath, "utf8");
    const actionVersions: Record<string, string> = {};
    const lines = lockFileContent.split("\n");
    for (const line of lines) {
      if (line) {
        const [actionName, version] = line.split("=");
        actionVersions[actionName] = version;
      }
    }
    return actionVersions;
  } catch (e) {
    const error = e as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      logger.warn("Lock file does not exist, creating new one");
    } else if (error.code === "EACCES" || error.code === "EPERM") {
      logger.error("Permission denied accessing lock file", e);
    } else {
      logger.warn("Error reading lock file", e);
    }
    return {};
  }
};

export const saveLockFile = (
  filePath: string,
  actionVersions: Record<string, string>
) => {
  try {
    const lockFileContent = Object.entries(actionVersions)
      .map(([actionName, version]) => `${actionName}=${version}`)
      .join("\n");
    require("fs").writeFileSync(filePath, lockFileContent);
  } catch (e) {
    const error = e as NodeJS.ErrnoException;
    if (error.code === "EACCES" || error.code === "EPERM") {
      logger.error("Permission denied writing to lock file", e);
      throw new Error("Permission denied writing to lock file");
    } else if (error.code === "ENOENT") {
      logger.error("Directory does not exist for lock file", e);
      throw new Error("Directory does not exist for lock file");
    } else {
      logger.error("Error writing to lock file", e);
      throw new Error("Error writing to lock file");
    }
  }
};
