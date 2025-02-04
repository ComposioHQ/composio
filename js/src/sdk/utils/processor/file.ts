import {
  TPostProcessor,
  TPreProcessor,
  TSchemaProcessor,
} from "../../../types/base_toolset";
import logger from "../../../utils/logger";
import { saveFile } from "../fileUtils";

type FileBasePropertySchema = {
  properties: Record<string, unknown>;
  required: string[];
  type: string;
  title: string;
  description: string;
} & Record<string, unknown>;

export const FILE_UPLOADABLE_SCHEMA = [
  {
    baseSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        mimeType: { type: "string" },
        s3Key: { type: "string" },
      },
    },
    converter: (propertyItem: FileBasePropertySchema) => {
      if (propertyItem.file_uploadable) {
        return {
          [`${propertyItem.name}_schema_parsed_file_uploadable`]: true,
          type: "string",
          description: propertyItem.description,
        };
      }
      return propertyItem;
    },
    deConvertValue: async (
      responseData: Record<string, unknown>,
      actionName: string
    ) => {
      for (const key of Object.keys(responseData)) {
        if (key.endsWith("_schema_parsed_file_uploadable")) {
          const keyWithoutSchemaParsed = key.replace(
            "_schema_parsed_file_uploadable",
            ""
          );
          const value = responseData[key];

          const fileData = await getFileData(value as string, actionName);
          responseData[keyWithoutSchemaParsed] = {
            name: fileData.name,
            mimeType: fileData.mimeType,
            //TODO: add s3Key
            s3Key: fileData.s3Key,
          };

          delete responseData[key];
        }
      }
      return responseData;
    },
  },
];

const readFileContent = async (
  path: string
): Promise<{ content: string; mimeType: string }> => {
  try {
    const content = require("fs").readFileSync(path, "utf-8");
    return { content, mimeType: "text/plain" };
  } catch (error) {
    throw new Error(`Error reading file at ${path}: ${error}`);
  }
};

const readFileContentFromURL = async (
  path: string
): Promise<{ content: string; mimeType: string }> => {
  const response = await fetch(path);
  const content = await response.text();
  return { content, mimeType: "text/plain" };
};

const getFileData = async (
  path: string,
  actionName: string
): Promise<{
  name: string;
  mimeType: string;
  content: string;
}> => {
  const isURL = path.startsWith("http");
  const fileData = isURL
    ? await readFileContentFromURL(path)
    : await readFileContent(path);
  return {
    name: path.split("/").pop() || `${actionName}_${Date.now()}`,
    mimeType: fileData.mimeType,
    content: fileData.content,
  };
};

export const fileResponseProcessor: TPostProcessor = ({
  actionName,
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

export const fileInputProcessor: TPreProcessor = ({ params, actionName }) => {
  const requestData = Object.entries(params).reduce(
    (acc, [key, value]) => {
      if (key === "file_uri_path" && typeof value === "string") {
        try {
          //eslint-disable-next-line @typescript-eslint/no-require-imports
          const fileContent = require("fs").readFileSync(value, "utf-8");
          const fileName =
            value.split("/").pop() || `${actionName}_${Date.now()}`;
          acc["file"] = { name: fileName, content: fileContent };
        } catch (error) {
          logger.error(`Error reading file at ${value}:`, error);
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
    const property = clonedProperties[propertyKey];
    const file_uploadable = property.file_uploadable;

    if (file_uploadable) {
      const newKey = `${propertyKey}_file_uri_path`;
      clonedProperties[newKey] = {
        type: "string",
        title: "Name",
        description: "Local absolute path to the file or http url to the file",
      };
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
