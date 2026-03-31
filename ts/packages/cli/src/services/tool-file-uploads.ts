import fs from 'node:fs/promises';
import path from 'node:path';
import type { Composio as RawComposioClient } from '@composio/client';
import { toolkitFromToolSlug } from 'src/utils/toolkit-from-tool-slug';

type JsonSchema = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFileLike = (value: unknown): value is File =>
  typeof File !== 'undefined' && value instanceof File;

const isSchemaRecord = (value: unknown): value is JsonSchema => isRecord(value);

const getSchemaVariants = (schema: JsonSchema | undefined): ReadonlyArray<JsonSchema> => [
  ...((Array.isArray(schema?.anyOf) ? schema.anyOf : []) as JsonSchema[]),
  ...((Array.isArray(schema?.oneOf) ? schema.oneOf : []) as JsonSchema[]),
  ...((Array.isArray(schema?.allOf) ? schema.allOf : []) as JsonSchema[]),
];

const transformSchema = (schema: JsonSchema): JsonSchema => {
  if (schema.file_uploadable === true) {
    return {
      title: schema.title,
      description: schema.description,
      format: 'path',
      type: 'string',
      file_uploadable: true,
    };
  }

  const transformed: JsonSchema = { ...schema };

  if (isSchemaRecord(schema.properties)) {
    transformed.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [
        key,
        isSchemaRecord(value) ? transformSchema(value) : value,
      ])
    );
  }

  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    if (Array.isArray(schema[key])) {
      transformed[key] = schema[key].map(value =>
        isSchemaRecord(value) ? transformSchema(value) : value
      );
    }
  }

  if (Array.isArray(schema.items)) {
    transformed.items = schema.items.map(value =>
      isSchemaRecord(value) ? transformSchema(value) : value
    );
  } else if (isSchemaRecord(schema.items)) {
    transformed.items = transformSchema(schema.items);
  }

  return transformed;
};

export const normalizeFileUploadSchema = (schema: JsonSchema): JsonSchema =>
  isSchemaRecord(schema) ? transformSchema(schema) : schema;

export const schemaHasFileUploadable = (schema: JsonSchema | undefined): boolean => {
  if (!schema) return false;
  if (schema.file_uploadable === true) return true;

  if (isSchemaRecord(schema.properties)) {
    for (const property of Object.values(schema.properties)) {
      if (isSchemaRecord(property) && schemaHasFileUploadable(property)) {
        return true;
      }
    }
  }

  for (const variant of getSchemaVariants(schema)) {
    if (schemaHasFileUploadable(variant)) {
      return true;
    }
  }

  if (Array.isArray(schema.items)) {
    return schema.items.some(item => isSchemaRecord(item) && schemaHasFileUploadable(item));
  }

  if (isSchemaRecord(schema.items)) {
    return schemaHasFileUploadable(schema.items);
  }

  return false;
};

export const findFileUploadablePaths = (
  schema: JsonSchema | undefined,
  basePath: ReadonlyArray<string> = []
): ReadonlyArray<ReadonlyArray<string>> => {
  if (!schema) return [];

  if (schema.file_uploadable === true) {
    return [basePath];
  }

  const directPropertyPaths = isSchemaRecord(schema.properties)
    ? Object.entries(schema.properties).flatMap(([key, property]) =>
        isSchemaRecord(property) ? findFileUploadablePaths(property, [...basePath, key]) : []
      )
    : [];

  const variantPaths = getSchemaVariants(schema).flatMap(variant =>
    findFileUploadablePaths(variant, basePath)
  );

  const itemPaths = Array.isArray(schema.items)
    ? schema.items.flatMap(item =>
        isSchemaRecord(item) ? findFileUploadablePaths(item, basePath) : []
      )
    : isSchemaRecord(schema.items)
      ? findFileUploadablePaths(schema.items, basePath)
      : [];

  const seen = new Set<string>();
  return [...directPropertyPaths, ...variantPaths, ...itemPaths].filter(pathParts => {
    const key = pathParts.join('.');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const readFileFromUrl = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const parsedUrl = new URL(url);
  const fileName = path.basename(parsedUrl.pathname) || `file-${Date.now()}`;

  return {
    bytes,
    fileName,
    mimeType: response.headers.get('content-type') || 'application/octet-stream',
  };
};

const readFileFromDisk = async (filePath: string) => ({
  bytes: new Uint8Array(await fs.readFile(filePath)),
  fileName: path.basename(filePath),
  mimeType: 'application/octet-stream',
});

const readUploadSource = async (file: string | File) => {
  if (isFileLike(file)) {
    return {
      bytes: new Uint8Array(await file.arrayBuffer()),
      fileName: file.name || `file-${Date.now()}`,
      mimeType: file.type || 'application/octet-stream',
    };
  }

  if (typeof file === 'string' && /^https?:\/\//i.test(file)) {
    return readFileFromUrl(file);
  }

  if (typeof file === 'string') {
    return readFileFromDisk(file);
  }

  throw new Error('Unsupported upload source');
};

const uploadFile = async (params: {
  readonly file: string | File;
  readonly toolSlug: string;
  readonly toolkitSlug: string;
  readonly client: RawComposioClient;
}) => {
  const fileData = await readUploadSource(params.file);
  const { createHash } = await import('node:crypto');
  const md5 = createHash('md5').update(fileData.bytes).digest('hex');
  const presigned = await params.client.files.createPresignedURL({
    filename: fileData.fileName,
    mimetype: fileData.mimeType,
    md5,
    tool_slug: params.toolSlug,
    toolkit_slug: params.toolkitSlug,
  });

  const uploadResponse = await fetch(presigned.new_presigned_url, {
    method: 'PUT',
    body: fileData.bytes,
    headers: {
      'Content-Type': fileData.mimeType,
      'Content-Length': fileData.bytes.byteLength.toString(),
    },
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload file to S3: ${uploadResponse.statusText}`);
  }

  return {
    name: fileData.fileName,
    mimetype: fileData.mimeType,
    s3key: presigned.key,
  };
};

const hydrateFileUploads = async (
  value: unknown,
  schema: JsonSchema | undefined,
  ctx: {
    readonly toolSlug: string;
    readonly toolkitSlug: string;
    readonly client: RawComposioClient;
  }
): Promise<unknown> => {
  if (schema?.file_uploadable === true) {
    if (typeof value !== 'string' && !isFileLike(value)) {
      return value;
    }

    return uploadFile({
      file: value,
      toolSlug: ctx.toolSlug,
      toolkitSlug: ctx.toolkitSlug,
      client: ctx.client,
    });
  }

  const uploadableVariants = getSchemaVariants(schema).filter(schemaHasFileUploadable);
  if (uploadableVariants.length > 0) {
    let nextValue = value;
    for (const variant of uploadableVariants) {
      nextValue = await hydrateFileUploads(nextValue, variant, ctx);
    }
    return nextValue;
  }

  if (isSchemaRecord(schema?.properties) && isRecord(value)) {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, entryValue]) => [
        key,
        await hydrateFileUploads(
          entryValue,
          isSchemaRecord((schema.properties as Record<string, unknown>)[key])
            ? ((schema.properties as Record<string, unknown>)[key] as JsonSchema)
            : undefined,
          ctx
        ),
      ])
    );
    return Object.fromEntries(entries);
  }

  if (schema?.type === 'array' && Array.isArray(value) && schema.items) {
    const itemSchema = Array.isArray(schema.items)
      ? schema.items.find(isSchemaRecord)
      : isSchemaRecord(schema.items)
        ? schema.items
        : undefined;

    return Promise.all(value.map(item => hydrateFileUploads(item, itemSchema, ctx)));
  }

  return value;
};

export const uploadToolInputFiles = async (params: {
  readonly toolSlug: string;
  readonly arguments_: Record<string, unknown>;
  readonly inputSchema: JsonSchema;
  readonly client: RawComposioClient;
  readonly toolkitSlug?: string;
}): Promise<Record<string, unknown>> => {
  if (!schemaHasFileUploadable(params.inputSchema)) {
    return params.arguments_;
  }

  const hydrated = await hydrateFileUploads(params.arguments_, params.inputSchema, {
    toolSlug: params.toolSlug,
    toolkitSlug: params.toolkitSlug ?? toolkitFromToolSlug(params.toolSlug) ?? 'unknown',
    client: params.client,
  });

  return isRecord(hydrated) ? hydrated : params.arguments_;
};
