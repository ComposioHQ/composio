import {
  Tool,
  ToolExecuteParams,
  ToolExecuteResponse,
  JSONSchemaProperty,
} from '../../types/tool.types';
import ComposioClient from '@composio/client';
import logger from '../logger';
import {
  ComposioFileNotFoundError,
  ComposioFileUploadAbortedError,
  ComposioFileUploadError,
  ComposioFileUploadPathNotAllowedError,
  ComposioSensitiveFilePathBlockedError,
} from '../../errors/FileModifierErrors';
import { ComposioRequestCancelledError } from '../../errors/SDKErrors';
import type { beforeFileUploadModifier } from '../../types/modifiers.types';
import {
  downloadFileFromS3,
  getFileDataAfterUploadingToS3,
  isHttpUrl,
  type GetFileDataAfterUploadingToS3Options,
} from '../fileUtils.node';
import {
  isPlainObject,
  transformProperties,
  schemaHasFileProperty,
} from './FileToolModifier.utils.neutral';
import { dereferenceJsonSchema } from '../jsonSchema';
import { withCancellation } from '../cancellation';

/**
 * Inlines internal `$ref` pointers so the file walkers below can see the
 * `file_uploadable` / `file_downloadable` flags that live behind a
 * `$ref`/`$defs` indirection (e.g. `GMAIL_GET_ATTACHMENT`). The walkers only
 * recurse `properties`/`anyOf`/`oneOf`/`allOf`/`items` and never dereference,
 * so without this a flagged field reachable only through a `$ref` is silently
 * missed — the file is never staged/downloaded. `'sentinel'` mode keeps tools
 * whose schema omits the `$defs` target working (see
 * https://github.com/ComposioHQ/composio/issues/3307) instead of throwing.
 */
const resolveFileSchema = (
  schema: JSONSchemaProperty | undefined
): JSONSchemaProperty | undefined =>
  schema ? dereferenceJsonSchema(schema, { onUnresolved: 'sentinel' }) : schema;

const getSchemaVariants = (schema: JSONSchemaProperty | undefined): JSONSchemaProperty[] => [
  ...(schema?.anyOf ?? []),
  ...(schema?.oneOf ?? []),
  ...(schema?.allOf ?? []),
];

const jsonSchemaTypeMatchesValue = (schema: JSONSchemaProperty, value: unknown): boolean => {
  const schemaType = schema.type;

  if (Array.isArray(schemaType)) {
    return schemaType.some(type => jsonSchemaTypeMatchesValue({ ...schema, type }, value));
  }

  if (schemaType === undefined) {
    if (schema.properties) return isPlainObject(value);
    if (schema.items) return Array.isArray(value);
    return false;
  }

  switch (schemaType) {
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isPlainObject(value);
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return false;
  }
};

const findSchemaVariantWithFileProperty = (
  schema: JSONSchemaProperty | undefined,
  property: 'file_uploadable' | 'file_downloadable',
  value: unknown
): JSONSchemaProperty | undefined => {
  const candidates = getSchemaVariants(schema).filter(variant =>
    schemaHasFileProperty(variant, property)
  );

  return (
    candidates.find(candidate => jsonSchemaTypeMatchesValue(candidate, value)) ?? candidates[0]
  );
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
  } & Pick<
    GetFileDataAfterUploadingToS3Options,
    | 'sensitiveFileUploadProtection'
    | 'fileUploadPathDenySegments'
    | 'fileUploadAllowlist'
    | 'signal'
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

    const runBeforeFileUpload = async (
      path: string,
      source: 'path' | 'url' | 'file'
    ): Promise<string> => {
      if (!ctx.beforeFileUpload) {
        return path;
      }
      const out = await ctx.beforeFileUpload({
        path,
        source,
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
      // Match the URL/local-path split used downstream in
      // getFileDataAfterUploadingToS3 so the hook sees the same categorisation.
      const source = isHttpUrl(value) ? 'url' : 'path';
      const pathOrUrl = await runBeforeFileUpload(value, source);
      logger.debug(`Uploading file "${pathOrUrl}"`);
      return getFileDataAfterUploadingToS3(pathOrUrl, {
        toolSlug: ctx.toolSlug,
        toolkitSlug: ctx.toolkitSlug,
        client: ctx.client,
        sensitiveFileUploadProtection: ctx.sensitiveFileUploadProtection,
        fileUploadPathDenySegments: ctx.fileUploadPathDenySegments,
        fileUploadAllowlist: ctx.fileUploadAllowlist,
        signal: ctx.signal,
      });
    }

    // File — `path` is the filename only; a string return replaces it with a
    // local-path upload.
    if (ctx.beforeFileUpload) {
      const out = await ctx.beforeFileUpload({
        path: value.name,
        source: 'file',
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
          fileUploadAllowlist: ctx.fileUploadAllowlist,
          signal: ctx.signal,
        });
      }
    }
    logger.debug(`Uploading file "${value.name}"`);
    // File/Blob values are not subject to the upload-dir allowlist.
    return getFileDataAfterUploadingToS3(value, {
      toolSlug: ctx.toolSlug,
      toolkitSlug: ctx.toolkitSlug,
      client: ctx.client,
      sensitiveFileUploadProtection: ctx.sensitiveFileUploadProtection,
      fileUploadPathDenySegments: ctx.fileUploadPathDenySegments,
      signal: ctx.signal,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Handle anyOf/oneOf/allOf — pick the file-bearing variant whose
  // JSON Schema shape matches the runtime value, then hydrate against it.
  //
  // We deliberately do NOT loop over every uploadable variant. With `oneOf`,
  // exactly one variant should apply at runtime, and applying multiple would
  // upload the same file once per variant — two presigned-URL round-trips and
  // two S3 PUTs for a two-variant `oneOf`. If no runtime shape matches, fall
  // back to the first file-bearing variant to preserve historical behavior.
  // ──────────────────────────────────────────────────────────────────────────
  const uploadableVariant = findSchemaVariantWithFileProperty(schema, 'file_uploadable', value);
  if (uploadableVariant) {
    return hydrateFiles(value, uploadableVariant, ctx);
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
  ctx: { toolSlug: string; fileDownloadDir?: string; signal?: AbortSignal }
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
      fileDownloadDir: ctx.fileDownloadDir,
      signal: ctx.signal,
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
  ctx: { toolSlug: string; fileDownloadDir?: string; signal?: AbortSignal }
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
  const schemaVariants = getSchemaVariants(schema);

  if (schemaVariants.length > 0) {
    const downloadableVariant = findSchemaVariantWithFileProperty(
      schema,
      'file_downloadable',
      value
    );
    if (downloadableVariant) {
      return hydrateDownloads(value, downloadableVariant, ctx);
    }

    // If no downloadable variants found, still traverse the value for s3url objects
    return hydrateDownloads(value, undefined, ctx);
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
    'sensitiveFileUploadProtection' | 'fileUploadPathDenySegments' | 'fileUploadAllowlist'
  > & { beforeFileUpload?: beforeFileUploadModifier; fileDownloadDir?: string };

  constructor(
    client: ComposioClient,
    fileUploadPathOptions: FileToolModifier['fileUploadPathOptions'] = {}
  ) {
    this.client = client;
    this.fileUploadPathOptions = fileUploadPathOptions;
  }

  async modifyToolSchema(schema: Tool): Promise<Tool> {
    if (!schema.inputParameters?.properties) {
      return schema;
    }

    const inputParameters = resolveFileSchema(schema.inputParameters)!;
    const properties = transformProperties(inputParameters.properties!);

    return {
      ...schema,
      inputParameters: {
        ...inputParameters,
        type: 'object',
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
      signal?: AbortSignal;
    }
  ): Promise<ToolExecuteParams> {
    const { params, toolSlug, toolkitSlug = 'unknown', signal } = options;
    const { arguments: args } = params;

    if (!args || typeof args !== 'object') return params;

    try {
      const newArgs = await withCancellation(
        () =>
          hydrateFiles(args, resolveFileSchema(tool.inputParameters), {
            toolSlug,
            toolkitSlug,
            client: this.client,
            ...this.fileUploadPathOptions,
            signal,
          }),
        signal
      );
      return { ...params, arguments: newArgs as ToolExecuteParams['arguments'] };
    } catch (error) {
      if (
        error instanceof ComposioRequestCancelledError ||
        error instanceof ComposioSensitiveFilePathBlockedError ||
        error instanceof ComposioFileUploadAbortedError ||
        error instanceof ComposioFileUploadPathNotAllowedError ||
        error instanceof ComposioFileNotFoundError
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
      toolkitSlug: string;
      result: ToolExecuteResponse;
      signal?: AbortSignal;
    }
  ): Promise<ToolExecuteResponse> {
    const { result, toolSlug, signal } = options;

    const dataWithDownloads = await hydrateDownloads(
      result.data,
      resolveFileSchema(tool.outputParameters),
      {
        toolSlug,
        fileDownloadDir: this.fileUploadPathOptions.fileDownloadDir,
        signal,
      }
    );

    return { ...result, data: dataWithDownloads as typeof result.data };
  }
}
