import { RawActionData } from "../../../types/base_toolset";
import { updateLockFileWithActionVersion } from "../lockFile";

export const actionLockProcessor = (
  filePath: string,
  {
    actionName,
    toolSchema,
  }: {
    actionName: string;
    toolSchema: RawActionData;
  }
): RawActionData => {
  const version = toolSchema.version;

  updateLockFileWithActionVersion(filePath, actionName, version);

  return toolSchema;
};
