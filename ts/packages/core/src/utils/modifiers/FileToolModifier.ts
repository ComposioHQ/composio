import {
  JSONSchemaProperty,
  Tool,
  ToolExecuteParams,
  ToolExecuteResponse,
} from '../../types/tool.types';
import ComposioClient from '@composio/client';
import logger from '../logger';
import { ComposioFileUploadError } from '../../errors/FileModifierErrors';
import { downloadFileFromS3, getFileDataAfterUploadingToS3 } from '../fileUtils';

/**
 * Transforms the properties of the tool schema to include the file upload URL.
 *
 * Attaches the format: 'path' to the properties that are file uploadable for agents.
 *
 * @param properties - The properties of the tool schema.
 * @returns The transformed properties.
 */
const transformProperties = (properties: JSONSchemaProperty): JSONSchemaProperty => {
  const newProperties: JSONSchemaProperty = {};

  for (const [key, property] of Object.entries(properties) as [string, JSONSchemaProperty][]) {
    if (!property.file_uploadable) {
      newProperties[key] = property;
      continue;
    }
    newProperties[key] = {
      ...property,
      format: 'path',
    };
  }

  return newProperties;
};

export class FileToolModifier {
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
  }

  /**
   * Modifies the tool schema to include the file upload URL.
   *
   * @description This modifier is used to upload a file to the Composio platform and replace the file path with the file upload URL.
   *
   * @param _toolSlug - The slug of the tool that is being executed.
   * @param _toolkitSlug - The slug of the toolkit that is being executed.
   * @param schema - The schema of the tool.
   * @returns The schema with the file upload URL included.
   */
  async modifyToolSchema(toolSlug: string, toolkitSlug: string, schema: Tool): Promise<Tool> {
    if (!schema.inputParameters?.properties) {
      return schema;
    }

    const properties = transformProperties(schema.inputParameters.properties);

    return {
      ...schema,
      inputParameters: {
        ...schema.inputParameters,
        properties,
      },
    };
  }

  /**
   * Modifies the input parameters to include the file upload URL.
   *
   * @description This modifier is used to upload a file to the Composio platform and replace the file path with the file upload URL.
   *
   * @param toolSlug - The slug of the tool that is being executed.
   * @param toolkitSlug - The slug of the toolkit that is being executed.
   *
   */
  async fileUploadModifier(
    tool: Tool,
    options: { toolSlug: string; toolkitSlug: string; params: ToolExecuteParams }
  ): Promise<ToolExecuteParams> {
    const { arguments: args } = options.params;
    if (!args) {
      return options.params;
    }
    // Check if the arguments is an object
    for (const key of Object.keys(args)) {
      // Check if the key ends with _schema_parsed_file and is a string
      const toolProperty = tool.inputParameters?.properties?.[key];

      if (toolProperty?.file_uploadable) {
        logger.debug(`Processing file upload for: ${key}`);
        try {
          const fileData = await getFileDataAfterUploadingToS3({
            path: args[key] as string,
            toolSlug: options.toolSlug,
            toolkitSlug: options.toolkitSlug ?? 'unknown',
            client: this.client,
          });
          args[key] = fileData;
        } catch (error) {
          throw new ComposioFileUploadError(`Failed to upload file: ${key}`, {
            cause: error,
          });
        }
      }
    }
    return options.params;
  }

  /**
   * Modifies the result to include the file download URL.
   *
   * @description This modifier is used to download a file and
   *
   * @param toolSlug - The slug of the tool that is being executed.
   * @param toolkitSlug - The slug of the toolkit that is being executed.
   * @param result - The result of the tool execution.
   * @returns The result with the file download URL included.
   */
  async fileDownloadModifier(
    tool: Tool,
    options: {
      toolSlug: string;
      toolkitSlug: string;
      result: ToolExecuteResponse;
    }
  ): Promise<ToolExecuteResponse> {
    for (const [key, value] of Object.entries(options.result?.data)) {
      const fileData = value as { s3url?: string; mimetype?: string };

      if (!fileData?.s3url) continue;

      logger.debug(`Downloading file from S3: ${fileData.s3url}`);

      try {
        const downloadedFile = await downloadFileFromS3({
          toolSlug: options.toolSlug,
          s3Url: fileData.s3url,
          mimeType: fileData.mimetype || 'application/txt',
        });

        logger.debug(`Downloaded file from S3: ${downloadedFile.filePath}`);

        options.result.data[key] = {
          uri: downloadedFile.filePath,
          file_downloaded: true,
          s3url: fileData.s3url,
          mimeType: downloadedFile.mimeType,
        };
      } catch (error) {
        logger.error(`Failed to download file from S3: ${fileData.s3url}`, {
          cause: error,
        });
        options.result.data[key] = {
          uri: '',
          file_downloaded: false,
          s3url: fileData.s3url,
          mimeType: fileData.mimetype || 'application/txt',
        };
      }
    }
    return options.result;
  }
}
