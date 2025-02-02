import { RawActionData } from "../../../types/base_toolset";

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
  return toolSchema;
};
