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
  actionName: string
) => {
  const result = { ...params };

  for (const [key, value] of Object.entries(result)) {
    if (!key.endsWith(FILE_SUFFIX)) continue;

    const isEmpty = value === "" || !value;
    if (isEmpty) {
      delete result[key];
      continue;
    }

    const originalKey = key.replace(FILE_SUFFIX, "");
    const fileData = await getFileDataAfterUploadingToS3(
      value as string,
      actionName
    );

    result[originalKey] = fileData;
    delete result[key];
  }

  return result;
};

export const FILE_INPUT_PROCESSOR: TPreProcessor = async ({
  params,
  actionName,
}) => {
  return processFileUpload(params, actionName);
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
      mimeType: downloadedFile.mimeType,
    };
  }

  return result;
};

export const FILE_SCHEMA_PROCESSOR: TSchemaProcessor = ({ toolSchema }) => {
  const { properties, required: requiredProps = [] } = toolSchema.parameters;
  const newProperties = { ...properties };
  const newRequired = [...requiredProps];

  const updateSingleProperty = (
    key: string,
    property: Record<string, unknown>
  ) => {
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
  };

  const updateAnyOfProperties = (
    key: string,
    property: Record<string, unknown>
  ) => {
    let newKeyName = key;
    const newAnyOf = property.anyOf.map((schema: Record<string, unknown>) => {
      if (!schema.file_uploadable) return schema;

      const { type, keyName, description } = convertFileSchemaProperty(
        key,
        schema as FileBasePropertySchema
      );

      newKeyName = keyName as string;

      return {
        title: key,
        type,
        description: property.description,
      };
    });

    newProperties[newKeyName] = {
      ...property,
      anyOf: newAnyOf,
    };
    delete newProperties[key];

    if (requiredProps.includes(key)) {
      newRequired[newRequired.indexOf(key)] = newKeyName as string;
    }
  };

  for (const [key, property] of Object.entries(newProperties)) {
    if (Array.isArray(property.anyOf)) {
      updateAnyOfProperties(key, property);
    } else if (property.file_uploadable) {
      updateSingleProperty(key, property);
    }
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
