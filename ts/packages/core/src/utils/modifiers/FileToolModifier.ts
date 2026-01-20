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
 * Transforms a single JSON schema property, recursively handling nested properties,
 * anyOf, oneOf, and allOf.
 */
const transformSchema = (property: JSONSchemaProperty): JSONSchemaProperty => {
  if (property.file_uploadable) {
    // Transform file-uploadable property
    return {
      title: property.title,
      description: property.description,
      format: 'path',
      type: 'string',
      file_uploadable: true,
    };
  }

  const newProperty = { ...property };

  if (property.type === 'object' && property.properties) {
    // Recursively transform nested properties
    newProperty.properties = transformProperties(property.properties);
  }

  if (property.anyOf) {
    newProperty.anyOf = property.anyOf.map(transformSchema);
  }

  if (property.oneOf) {
    newProperty.oneOf = property.oneOf.map(transformSchema);
  }

  if (property.allOf) {
    newProperty.allOf = property.allOf.map(transformSchema);
  }

  if (property.items) {
    if (Array.isArray(property.items)) {
      newProperty.items = property.items.map(transformSchema);
    } else {
      newProperty.items = transformSchema(property.items);
    }
  }

  return newProperty;
};

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
    newProperties[key] = transformSchema(property);
  }

  return newProperties;
};

/**
 * Recursively checks if a schema (or any of its variants) contains a specific file property.
 */
const schemaHasFileProperty = (
  schema: JSONSchemaProperty | undefined,
  property: 'file_uploadable' | 'file_downloadable'
): boolean => {
  if (!schema) return false;
  if (schema[property]) return true;

  // Check nested properties
  if (schema.properties) {
    for (const prop of Object.values(schema.properties) as JSONSchemaProperty[]) {
      if (schemaHasFileProperty(prop, property)) return true;
    }
  }

  // Check anyOf/oneOf/allOf variants
  if (schema.anyOf) {
    for (const variant of schema.anyOf) {
      if (schemaHasFileProperty(variant, property)) return true;
    }
  }
  if (schema.oneOf) {
    for (const variant of schema.oneOf) {
      if (schemaHasFileProperty(variant, property)) return true;
    }
  }
  if (schema.allOf) {
    for (const variant of schema.allOf) {
      if (schemaHasFileProperty(variant, property)) return true;
    }
  }

  // Check array items
  if (schema.items) {
    if (Array.isArray(schema.items)) {
      for (const item of schema.items) {
        if (schemaHasFileProperty(item, property)) return true;
      }
    } else {
      if (schemaHasFileProperty(schema.items, property)) return true;
    }
  }

  return false;
};

/**
 * Recursively checks if a schema (or any of its variants) contains file_uploadable properties.
 */
const schemaHasFileUploadable = (schema: JSONSchemaProperty | undefined): boolean => {
  return schemaHasFileProperty(schema, 'file_uploadable');
};

/**
 * Recursively checks if a schema (or any of its variants) contains file_downloadable properties.
 */
const schemaHasFileDownloadable = (schema: JSONSchemaProperty | undefined): boolean => {
  return schemaHasFileProperty(schema, 'file_downloadable');
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
  // 2. Handle anyOf/oneOf/allOf - try each variant that may contain file_uploadable
  // ──────────────────────────────────────────────────────────────────────────
  const schemaVariants = [
    ...(schema?.anyOf ?? []),
    ...(schema?.oneOf ?? []),
    ...(schema?.allOf ?? []),
  ];

  if (schemaVariants.length > 0) {
    // Find variants that have file_uploadable properties
    const uploadableVariants = schemaVariants.filter(schemaHasFileUploadable);

    if (uploadableVariants.length > 0) {
      // Process with each uploadable variant - we try all since we can't know which one matches at runtime
      let result = value;
      for (const variant of uploadableVariants) {
        result = await hydrateFiles(result, variant, ctx);
      }
      return result;
    }
    // If no uploadable variants found, fall through to check base properties
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Object → traverse each property
  // ──────────────────────────────────────────────────────────────────────────
  if (schema?.type === 'object' && schema.properties && isPlainObject(value)) {
    const transformed: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(value)) {
      transformed[k] = await hydrateFiles(v, schema.properties[k], ctx);
    }
    return transformed;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Array → traverse each item
  // ──────────────────────────────────────────────────────────────────────────
  if (schema?.type === 'array' && schema.items && Array.isArray(value)) {
    // `items` can be a single schema or an array of schemas; we handle both.
    const itemSchema = Array.isArray(schema.items) ? schema.items[0] : schema.items;

    return Promise.all(
      value.map(item => hydrateFiles(item, itemSchema as JSONSchemaProperty, ctx))
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Primitive or schema-less branch → return unchanged
  // ──────────────────────────────────────────────────────────────────────────
  return value;
};

/**
 * Downloads a file from S3 and returns a replacement object.
 */
const downloadS3File = async (
  value: Record<string, unknown>,
  ctx: { toolSlug: string }
): Promise<unknown> => {
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
const hydrateDownloads = async (
  value: unknown,
  schema: JSONSchemaProperty | undefined,
  ctx: { toolSlug: string }
): Promise<unknown> => {
  // ──────────────────────────────────────────────────────────────────────────
  // 1. Direct S3 reference (data-driven detection)
  // ──────────────────────────────────────────────────────────────────────────
  if (isPlainObject(value) && typeof value.s3url === 'string') {
    return downloadS3File(value, ctx);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Schema-guided: Handle file_downloadable property
  // ──────────────────────────────────────────────────────────────────────────
  if (schema?.file_downloadable && isPlainObject(value) && typeof value.s3url === 'string') {
    return downloadS3File(value, ctx);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Handle anyOf/oneOf/allOf - try each variant that may contain file_downloadable
  // ──────────────────────────────────────────────────────────────────────────
  const schemaVariants = [
    ...(schema?.anyOf ?? []),
    ...(schema?.oneOf ?? []),
    ...(schema?.allOf ?? []),
  ];

  if (schemaVariants.length > 0) {
    // Find variants that have file_downloadable properties
    const downloadableVariants = schemaVariants.filter(schemaHasFileDownloadable);

    // Process with each downloadable variant
    let result = value;
    for (const variant of downloadableVariants) {
      result = await hydrateDownloads(result, variant, ctx);
    }

    // If no downloadable variants found, still traverse the value for s3url objects
    if (downloadableVariants.length === 0) {
      return hydrateDownloads(value, undefined, ctx);
    }

    return result;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Object → traverse each property
  // ──────────────────────────────────────────────────────────────────────────
  if (isPlainObject(value)) {
    const pairs = await Promise.all(
      Object.entries(value).map(async ([k, v]) => [
        k,
        await hydrateDownloads(v, schema?.properties?.[k], ctx),
      ])
    );
    return Object.fromEntries(pairs);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Array → traverse each item
  // ──────────────────────────────────────────────────────────────────────────
  if (Array.isArray(value)) {
    const itemSchema = schema?.items
      ? Array.isArray(schema.items)
        ? schema.items[0]
        : schema.items
      : undefined;

    return Promise.all(
      value.map(item => hydrateDownloads(item, itemSchema as JSONSchemaProperty | undefined, ctx))
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Primitive → return unchanged
  // ──────────────────────────────────────────────────────────────────────────
  return value;
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
   * @param tool - The tool schema containing output parameters.
   * @param toolSlug - The slug of the tool that is being executed.
   * @param toolkitSlug - The slug of the toolkit that is being executed.
   * @param result - The result of the tool execution.
   * @returns The result with the file download URL included.
   */
  async fileDownloadModifier(
    tool: Tool,
    options: {
      toolSlug: string;
      toolkitSlug: string; // kept for API parity, unused here
      result: ToolExecuteResponse;
    }
  ): Promise<ToolExecuteResponse> {
    const { result, toolSlug } = options;

    // Walk result.data without mutating the original, using output schema for guidance
    const dataWithDownloads = await hydrateDownloads(result.data, tool.outputParameters, {
      toolSlug,
    });

    return { ...result, data: dataWithDownloads as typeof result.data };
  }
}
