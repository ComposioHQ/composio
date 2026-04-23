import {
  Tool,
  ToolExecuteParams,
  ToolExecuteResponse,
  JSONSchemaProperty,
} from '../../types/tool.types';
import ComposioClient from '@composio/client';
import logger from '../logger';
import {
  ComposioFileUploadAbortedError,
  ComposioFileUploadError,
  ComposioSensitiveFilePathBlockedError,
} from '../../errors/FileModifierErrors';
import type { beforeFileUploadModifier } from '../../types/modifiers.types';
import {
  downloadFileFromS3,
  getFileDataAfterUploadingToS3,
  type GetFileDataAfterUploadingToS3Options,
} from '../fileUtils.node';
import {
  isPlainObject,
  transformProperties,
  schemaHasFileUploadable,
  schemaHasFileDownloadable,
} from './FileToolModifier.utils.neutral';

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
  } & Pick<
    GetFileDataAfterUploadingToS3Options,
    'sensitiveFileUploadProtection' | 'fileUploadPathDenySegments'
  > & {
      beforeFileUpload?: beforeFileUploadModifier;
    }
): Promise<unknown> => {
  // ──────────────────────────────────────────────────────────────────────────
  // 1. Direct file upload
  // ──────────────────────────────────────────────────────────────────────────
  if (schema?.file_uploadable) {
    // Upload only if the runtime value is a string (i.e., a local path) or blob
    if (typeof value !== 'string' && !(value instanceof File)) return value;

    const runBeforeFileUpload = async (path: string): Promise<string> => {
      if (!ctx.beforeFileUpload) {
        return path;
      }
      const out = await ctx.beforeFileUpload({
        path,
        toolSlug: ctx.toolSlug,
        toolkitSlug: ctx.toolkitSlug,
      });
      if (out === false) {
        throw new ComposioFileUploadAbortedError(
          'File upload was aborted because beforeFileUpload returned false.'
        );
      }
      return out;
    };

    if (typeof value === 'string') {
      const pathOrUrl = await runBeforeFileUpload(value);
      logger.debug(`Uploading file "${pathOrUrl}"`);
      return getFileDataAfterUploadingToS3(pathOrUrl, {
        toolSlug: ctx.toolSlug,
        toolkitSlug: ctx.toolkitSlug,
        client: ctx.client,
        sensitiveFileUploadProtection: ctx.sensitiveFileUploadProtection,
        fileUploadPathDenySegments: ctx.fileUploadPathDenySegments,
      });
    }

    // File
    if (ctx.beforeFileUpload) {
      const out = await ctx.beforeFileUpload({
        path: value.name,
        toolSlug: ctx.toolSlug,
        toolkitSlug: ctx.toolkitSlug,
      });
      if (out === false) {
        throw new ComposioFileUploadAbortedError(
          'File upload was aborted because beforeFileUpload returned false.'
        );
      }
      if (typeof out === 'string' && out !== value.name) {
        logger.debug(`Uploading file from path "${out}" (replaced File: ${value.name})`);
        return getFileDataAfterUploadingToS3(out, {
          toolSlug: ctx.toolSlug,
          toolkitSlug: ctx.toolkitSlug,
          client: ctx.client,
          sensitiveFileUploadProtection: ctx.sensitiveFileUploadProtection,
          fileUploadPathDenySegments: ctx.fileUploadPathDenySegments,
        });
      }
    }
    logger.debug(`Uploading file "${value.name}"`);
    return getFileDataAfterUploadingToS3(value, {
      toolSlug: ctx.toolSlug,
      toolkitSlug: ctx.toolkitSlug,
      client: ctx.client,
      sensitiveFileUploadProtection: ctx.sensitiveFileUploadProtection,
      fileUploadPathDenySegments: ctx.fileUploadPathDenySegments,
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

export class FileToolModifier {
  private client: ComposioClient;
  private fileUploadPathOptions: Pick<
    GetFileDataAfterUploadingToS3Options,
    'sensitiveFileUploadProtection' | 'fileUploadPathDenySegments'
  > & { beforeFileUpload?: beforeFileUploadModifier };

  constructor(
    client: ComposioClient,
    fileUploadPathOptions: FileToolModifier['fileUploadPathOptions'] = {}
  ) {
    this.client = client;
    this.fileUploadPathOptions = fileUploadPathOptions;
  }

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
        ...this.fileUploadPathOptions,
      });
      return { ...params, arguments: newArgs as ToolExecuteParams['arguments'] };
    } catch (error) {
      if (
        error instanceof ComposioSensitiveFilePathBlockedError ||
        error instanceof ComposioFileUploadAbortedError
      ) {
        throw error;
      }
      throw new ComposioFileUploadError('Failed to upload file', {
        cause: error,
      });
    }
  }

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
