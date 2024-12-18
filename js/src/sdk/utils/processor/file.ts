import {
  TPostProcessor,
  TPreProcessor,
  TSchemaProcessor,
} from "../../../types/base_toolset";
import { saveFile } from "../fileUtils";

export const fileResponseProcessor: TPostProcessor = ({
  actionName,
  appName,
  toolResponse,
}) => {
  const responseData =
    (toolResponse.data.response_data as Record<string, unknown>) || {};
  const fileData = responseData.file as
    | { name: string; content: string }
    | undefined;

  if (!fileData) return toolResponse;

  const fileNamePrefix = `${actionName}_${Date.now()}`;
  const filePath = saveFile(fileNamePrefix, fileData.content, true);

  delete responseData.file;

  return {
    ...toolResponse,
    data: {
      ...toolResponse.data,
      file_uri_path: filePath,
    },
  };
};

export const fileInputProcessor: TPreProcessor = ({
  params,
  actionName,
  appName,
}) => {
  const requestData = Object.entries(params).reduce(
    (acc, [key, value]) => {
      if (key === "file_uri_path" && typeof value === "string") {
        try {
          const fileContent = require("fs").readFileSync(value, "utf-8");
          const fileName =
            value.split("/").pop() || `${actionName}_${Date.now()}`;
          acc["file"] = { name: fileName, content: fileContent };
        } catch (error) {
          console.error(`Error reading file at ${value}:`, error);
          acc["file"] = { name: value, content: "" }; // Fallback to original value if reading fails
        }
      } else {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, unknown>
  );

  return requestData;
};

export const fileSchemaProcessor: TSchemaProcessor = ({ toolSchema }) => {
  const { properties } = toolSchema.parameters;
  const clonedProperties = JSON.parse(JSON.stringify(properties));

  for (const propertyKey of Object.keys(clonedProperties)) {
    const object = clonedProperties[propertyKey];
    const isObject = typeof object === "object";
    const isFile =
      isObject &&
      object?.required?.includes("name") &&
      object?.required?.includes("content");

    if (isFile) {
      const newKey = `${propertyKey}_file_uri_path`;
      clonedProperties[newKey] = {
        type: "string",
        title: "Name",
        description: "Local absolute path to the file or http url to the file",
      };

      delete clonedProperties[propertyKey];
    }
  }

  return {
    ...toolSchema,
    parameters: {
      ...toolSchema.parameters,
      properties: clonedProperties,
    },
  };
};
