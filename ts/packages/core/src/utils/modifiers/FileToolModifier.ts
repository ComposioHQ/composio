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
    if (property.file_uploadable) {
      // Transform file-uploadable property
      newProperties[key] = {
        title: property.title,
        description: property.description,
        format: 'path',
        type: 'string',
        file_uploadable: true,
      };
    } else if (property.type === 'object' && property.properties) {
      // Recursively transform nested properties
      newProperties[key] = {
        ...property,
        properties: transformProperties(property.properties),
      };
    } else {
      // Copy the property as-is
      newProperties[key] = property;
    }
  }

  return newProperties;
};

/**
 * Recursively walks a runtime value and its matching JSON-Schema node,
 * uploading any string path whose schema node has `file_uploadable: true`.
 * The function returns a **new** value with all substitutions applied;
 * nothing is mutated in-place.
 */
const hydrateFiles = async (
  value: unknown,
  schema: JSONSchemaProperty | undefined,
  ctx: {
    toolSlug: string;
    toolkitSlug: string;
    client: ComposioClient;
  }
): Promise<unknown> => {
  // ──────────────────────────────────────────────────────────────────────────
  // 1. Direct file upload
  // ──────────────────────────────────────────────────────────────────────────
  if (schema?.file_uploadable) {
    // Upload only if the runtime value is a string (i.e., a local path) or blob
    if (typeof value !== 'string' && !(value instanceof File)) return value;

    logger.debug(`Uploading file "${value}"`);
    return getFileDataAfterUploadingToS3(value, {
      toolSlug: ctx.toolSlug,
      toolkitSlug: ctx.toolkitSlug,
      client: ctx.client,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Object → traverse each property
  // ──────────────────────────────────────────────────────────────────────────
  if (schema?.type === 'object' && schema.properties && isPlainObject(value)) {
    const transformed: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(value)) {
      transformed[k] = await hydrateFiles(v, schema.properties[k], ctx);
    }
    return transformed;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Array → traverse each item
  // ──────────────────────────────────────────────────────────────────────────
  if (schema?.type === 'array' && schema.items && Array.isArray(value)) {
    // `items` can be a single schema or an array of schemas; we handle both.
    const itemSchema = Array.isArray(schema.items) ? schema.items[0] : schema.items;

    return Promise.all(
      value.map(item => hydrateFiles(item, itemSchema as JSONSchemaProperty, ctx))
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Primitive or schema-less branch → return unchanged
  // ──────────────────────────────────────────────────────────────────────────
  return value;
};

/**
 * Recursively walks an arbitrary value and its matching JSON-Schema node.
 * Whenever it encounters an object that represents a file reference
 * (i.e. has an `s3url`), it downloads the file and returns a replacement:
 *   {
 *     uri: "<local-path>",
 *     file_downloaded: true | false,
 *     s3url: "<original S3 URL>",
 *     mimeType: "<detected-or-fallback-mime-type>"
 *   }
 *
 * The function is side-effect-free: it never mutates the input value.
 */
/**
 * Walk a value (object, array, primitive).
 * Wherever an object contains a string `s3url`, download the file and
 * return a replacement object:
 *   {
 *     uri: "<local path>",
 *     file_downloaded: true|false,
 *     s3url: "<original url>",
 *     mimeType: "<detected-or-fallback>"
 *   }
 */
const hydrateDownloads = async (value: unknown, ctx: { toolSlug: string }): Promise<unknown> => {
  // ─────────────────────────────── 1. direct S3 ref ─────────────────────────
  if (isPlainObject(value) && typeof value.s3url === 'string') {
    const { s3url, mimetype } = value as {
      s3url: string;
      mimetype?: string;
    };

    try {
      logger.debug(`Downloading from S3: ${s3url}`);

      const dl = await downloadFileFromS3({
        toolSlug: ctx.toolSlug,
        s3Url: s3url,
        mimeType: mimetype ?? 'application/octet-stream',
      });

      logger.debug(`Downloaded → ${dl.filePath}`);

      return {
        uri: dl.filePath,
        file_downloaded: dl.filePath ? true : false,
        s3url,
        mimeType: dl.mimeType,
      };
    } catch (err) {
      logger.error(`Download failed: ${s3url}`, { cause: err });
      return {
        uri: '',
        file_downloaded: false,
        s3url,
        mimeType: mimetype ?? 'application/octet-stream',
      };
    }
  }

  // ─────────────────────────────── 2. object branch ─────────────────────────
  if (isPlainObject(value)) {
    const pairs = await Promise.all(
      Object.entries(value).map(async ([k, v]) => [k, await hydrateDownloads(v, ctx)])
    );
    return Object.fromEntries(pairs);
  }

  // ─────────────────────────────── 3. array branch ──────────────────────────
  if (Array.isArray(value)) {
    return Promise.all(value.map(item => hydrateDownloads(item, ctx)));
  }

  // ─────────────────────────────── 4. primitive ─────────────────────────────
  return value; // leave unchanged
};

// Small helper to recognise plain objects
function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

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
    options: {
      toolSlug: string;
      toolkitSlug?: string;
      params: ToolExecuteParams;
    }
  ): Promise<ToolExecuteParams> {
    const { params, toolSlug, toolkitSlug = 'unknown' } = options;
    const { arguments: args } = params;

    if (!args || typeof args !== 'object') return params;

    // Recursively transform the arguments tree without mutating the caller’s copy
    try {
      const newArgs = await hydrateFiles(args, tool.inputParameters, {
        toolSlug,
        toolkitSlug,
        client: this.client,
      });
      return { ...params, arguments: newArgs as ToolExecuteParams['arguments'] };
    } catch (error) {
      throw new ComposioFileUploadError('Failed to upload file', {
        cause: error,
      });
    }
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
    _tool: Tool, // no longer needed for the traversal itself
    options: {
      toolSlug: string;
      toolkitSlug: string; // kept for API parity, unused here
      result: ToolExecuteResponse;
    }
  ): Promise<ToolExecuteResponse> {
    const { result, toolSlug } = options;

    // Walk result.data without mutating the original
    const dataWithDownloads = await hydrateDownloads(result.data, { toolSlug });

    return { ...result, data: dataWithDownloads as typeof result.data };
  }
}
