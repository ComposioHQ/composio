import { Client } from "@hey-api/client-axios";
import {
  TPostProcessor,
  TPreProcessor,
  TSchemaProcessor,
} from "../../../types/base_toolset";
import { downloadFileFromS3, getFileDataAfterUploadingToS3 } from "./fileUtils";

type FileBasePropertySchema = {
  type: string;
  title: string;
  description: string;
  file_uploadable?: boolean;
} & Record<string, unknown>;

const FILE_SUFFIX = "_schema_parsed_file";

const convertFileSchemaProperty = (
  key: string,
  property: FileBasePropertySchema
) => {
  if (!property.file_uploadable) {
    return property;
  }

  return {
    keyName: `${key}${FILE_SUFFIX}`,
    type: "string",
    description: property.description,
  };
};

const processFileUpload = async (
  params: Record<string, unknown>,
  actionName: string,
  client: Client
) => {
  const result = { ...params };

  for (const [key, value] of Object.entries(result)) {
    if (!key.endsWith(FILE_SUFFIX)) continue;

    const originalKey = key.replace(FILE_SUFFIX, "");
    const fileData = await getFileDataAfterUploadingToS3(
      value as string,
      actionName,
      client
    );

    result[originalKey] = fileData;
    delete result[key];
  }

  return result;
};

export const FILE_INPUT_PROCESSOR: TPreProcessor = async ({
  params,
  actionName,
  client,
}) => {
  return processFileUpload(params, actionName, client);
};

export const FILE_DOWNLOADABLE_PROCESSOR: TPostProcessor = async ({
  actionName,
  toolResponse,
}) => {
  const result = JSON.parse(JSON.stringify(toolResponse));

  for (const [key, value] of Object.entries(toolResponse.data)) {
    const fileData = value as { s3url?: string; mimetype?: string };

    if (!fileData?.s3url) continue;

    const downloadedFile = await downloadFileFromS3({
      actionName,
      s3Url: fileData.s3url,
      mimeType: fileData.mimetype || "application/txt",
    });

    result.data[key] = {
      uri: downloadedFile.filePath,
      s3url: fileData.s3url,
      mimeType: downloadedFile.mimeType,
    };
  }

  return result;
};

export const FILE_SCHEMA_PROCESSOR: TSchemaProcessor = ({ toolSchema }) => {
  const { properties, required: requiredProps = [] } = toolSchema.parameters;
  const newProperties = { ...properties };
  const newRequired = [...requiredProps];

  for (const [key, property] of Object.entries(newProperties)) {
    if (!property.file_uploadable) continue;

    const { type, keyName, description } = convertFileSchemaProperty(
      key,
      property as FileBasePropertySchema
    );

    newProperties[keyName as string] = {
      title: property.title,
      type,
      description,
    };

    if (requiredProps.includes(key)) {
      newRequired[newRequired.indexOf(key)] = keyName as string;
    }

    delete newProperties[key];
  }

  return {
    ...toolSchema,
    parameters: {
      ...toolSchema.parameters,
      properties: newProperties,
      required: newRequired,
    },
  };
};
