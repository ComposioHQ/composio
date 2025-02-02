import fs from "fs";

export const loadLockFile = (filePath: string) => {
  const fileContent = fs.readFileSync(filePath, "utf8");
  return JSON.parse(fileContent);
};

export const saveLockFile = (
  filePath: string,
  actionName: string,
  version: string
) => {
  fs.writeFileSync(filePath, JSON.stringify({ actionName, version }, null, 2));
};
