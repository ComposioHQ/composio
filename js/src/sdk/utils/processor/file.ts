import {
  TPostProcessor,
  TPreProcessor,
  TSchemaProcessor,
} from "../../../types/base_toolset";
import { saveFile } from "../fileUtils";

type FileBasePropertySchema = {
  properties: Record<string, unknown>;
  required: string[];
  type: string;
  title: string;
  description: string;
} & Record<string, unknown>;

export const FILE_UPLOADABLE_SCHEMA = {
  suffix: "_schema_parsed_file",
  baseSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      mimeType: { type: "string" },
      s3Key: { type: "string" },
    },
  },
  converter: (key: string, propertyItem: FileBasePropertySchema) => {
    if (propertyItem.file_uploadable) {
      return {
        keyName: `${key}${FILE_UPLOADABLE_SCHEMA.suffix}`,
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
      if (key.endsWith(FILE_UPLOADABLE_SCHEMA.suffix)) {
        const keyWithoutSchemaParsed = key.replace(
          FILE_UPLOADABLE_SCHEMA.suffix,
          ""
        );
        const value = responseData[key];

        const fileData = await getFileDataAfterUploadingToS3(
          value as string,
          actionName
        );
        responseData[keyWithoutSchemaParsed] = {
          name: fileData.name,
          mimeType: fileData.mimeType,
          //TODO: add s3Key
          // @ts-ignore
          s3Key: fileData.s3Key,
        };

        delete responseData[key];
      }
    }
    return responseData;
  },
};

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

const uploadFileToS3 = async (
  content: string,
  actionName: string
): Promise<string> => {
  return content;
};

const getFileDataAfterUploadingToS3 = async (
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

  const content = await getFileDataAfterUploadingToS3(
    fileData.content,
    actionName
  );
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

export const fileInputProcessor: TPreProcessor = async ({
  params,
  actionName,
}) => {
  const updatedParams = await FILE_UPLOADABLE_SCHEMA.deConvertValue(
    params,
    actionName
  );

  return updatedParams;
};

export const fileSchemaProcessor: TSchemaProcessor = ({ toolSchema }) => {
  const toolParameters = toolSchema.parameters;
  const { properties } = toolParameters;
  let { required: requiredProperties } = toolParameters;

  const clonedProperties = Object.assign({}, properties);

  for (const originalKey of Object.keys(clonedProperties)) {
    const property = clonedProperties[originalKey];
    const file_uploadable = property.file_uploadable;

    if (!file_uploadable) continue;

    const { type, keyName, description } = FILE_UPLOADABLE_SCHEMA.converter(
      originalKey,
      property
    );

    clonedProperties[keyName as string] = {
      title: property.title,
      type,
      description,
    };

    const isKeyPartOfRequired = requiredProperties.includes(originalKey);

    // Remove the original key from required properties and add the new key
    if (isKeyPartOfRequired) {
      requiredProperties = requiredProperties.filter(
        (property) => property !== originalKey
      );
      requiredProperties.push(keyName as string);
    }

    // Remove the original key from the properties
    delete clonedProperties[originalKey];
  }

  const updatedToolSchema = {
    ...toolSchema,
    parameters: {
      ...toolSchema.parameters,
      properties: clonedProperties,
      required: requiredProperties,
    },
  };

  return updatedToolSchema;
};
