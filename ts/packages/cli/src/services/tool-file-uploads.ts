// The upload pipeline runs in the caller's fiber: the FileSystem read and the
// presigned-URL request are effects of their own, and the core SDK's
// promise-based helpers (the path and URL guards, the body reader, the upload
// transport) are wrapped at each call. The caller resolves the platform
// services and the Composio client and passes the instances in as parameters.
import type * as FileSystem from 'effect/FileSystem';
import type * as Path from 'effect/Path';
import type { ComposioClientShape, ComposioError } from '@composio/client/effect';
import { Data, Effect, Predicate, Schema } from 'effect';
import { guessToolkitFromToolSlug } from 'src/utils/toolkit-from-tool-slug';
import { idempotent } from 'src/services/composio-request';

type JsonSchema = Record<string, unknown>;
/**
 * Local path -> the name and MIME type to upload it under, for files their caller
 * staged (`composio run` writes each script File to a generated path). Labels
 * only: the path is still read, and checked against the denylist, as given.
 */
type StagedFiles = ReadonlyMap<string, { readonly name: string; readonly mimetype?: string }>;

// The core helpers below are only reached once an execute actually carries
// a file input, so they are imported on that path rather than at module scope:
// `@composio/core`'s root entry evaluates the whole SDK, which every command
// would otherwise pay for at startup. The module registry memoizes the import.
const loadCoreFileUploadHelpers = Effect.promise(() => import('@composio/core'));
const loadSsrfSafeFetch = Effect.promise(() => import('@composio/core/utils/ssrf-guard'));

export class ToolFileUploadError extends Data.TaggedError('services/ToolFileUploadError')<{
  readonly cause?: unknown;
  readonly message: string;
  readonly reason: 'source-fetch' | 'source-read' | 'unsupported-source' | 'upload';
  readonly status?: number;
}> {}

/**
 * Every failure of {@link uploadToolInputFiles}: reading or uploading a file,
 * or the presigned-URL request, as the client's own error.
 */
export type ToolInputUploadError = ToolFileUploadError | ComposioError;

// What a thrown value from the core SDK's helpers, or a platform error of the
// local read, becomes: the file could not be read as a source. An error this
// module raised itself passes through.
const asSourceReadError = (cause: unknown): ToolFileUploadError =>
  cause instanceof ToolFileUploadError
    ? cause
    : new ToolFileUploadError({
        cause,
        message: cause instanceof Error ? cause.message : String(cause),
        reason: 'source-read',
      });

const decodeRunStagedFiles = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Record(
      Schema.String,
      Schema.Struct({ name: Schema.String, mimetype: Schema.optional(Schema.String) })
    )
  )
);

/** Read the per-execute labels without putting the file batch in the environment. */
export const readRunStagedFiles = (
  fs: FileSystem.FileSystem,
  manifestPath: string | undefined
): Effect.Effect<StagedFiles, ToolFileUploadError> =>
  Effect.gen(function* () {
    if (!manifestPath) return new Map();
    const content = yield* fs.readFileString(manifestPath).pipe(Effect.mapError(asSourceReadError));
    const labels = yield* decodeRunStagedFiles(content).pipe(Effect.mapError(asSourceReadError));
    return new Map(Object.entries(labels));
  });

// Releases a body this module does not read, ignoring a cancellation failure.
const discardBody = (response: Response) =>
  Effect.ignore(Effect.tryPromise(() => response.body?.cancel() ?? Promise.resolve()));

const isFileLike = (value: unknown): value is File =>
  typeof File !== 'undefined' && value instanceof File;

const isSchemaRecord = (value: unknown): value is JsonSchema => Predicate.isObject(value);

const getSchemaVariant = (value: unknown): ReadonlyArray<JsonSchema> =>
  Array.isArray(value) ? value.filter(isSchemaRecord) : [];

// `items` is either one schema or a tuple of schemas; keep only the schema records.
const getItemSchemas = (items: unknown): ReadonlyArray<JsonSchema> => {
  if (Array.isArray(items)) return items.filter(isSchemaRecord);
  return isSchemaRecord(items) ? [items] : [];
};

const getSchemaVariants = (schema: JsonSchema | undefined): ReadonlyArray<JsonSchema> => [
  ...getSchemaVariant(schema?.anyOf),
  ...getSchemaVariant(schema?.oneOf),
  ...getSchemaVariant(schema?.allOf),
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

  const itemPaths = getItemSchemas(schema.items).flatMap(item =>
    findFileUploadablePaths(item, basePath)
  );

  const seen = new Set<string>();
  return [...directPropertyPaths, ...variantPaths, ...itemPaths].filter(pathParts => {
    const key = pathParts.join('.');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const readFileFromUrl = (path: Path.Path, url: string) =>
  Effect.gen(function* () {
    const { ssrfSafeFetch } = yield* loadSsrfSafeFetch;
    const response = yield* Effect.tryPromise({
      try: signal => ssrfSafeFetch(url, { signal }),
      catch: asSourceReadError,
    });
    if (!response.ok) {
      yield* discardBody(response);
      return yield* new ToolFileUploadError({
        message: `Failed to fetch file: ${response.statusText}`,
        reason: 'source-fetch',
        status: response.status,
      });
    }

    // Same cap as the core SDK's URL uploads: a remote server must not be able
    // to exhaust memory with an oversized or never-ending body. Copied into a
    // fresh ArrayBuffer-backed view for the same reason as readFileFromDisk.
    const { readResponseBodyWithLimit } = yield* loadCoreFileUploadHelpers;
    const body = yield* Effect.tryPromise({
      try: () => readResponseBodyWithLimit(response),
      catch: asSourceReadError,
    });
    const bytes = new Uint8Array(body);
    const parsedUrl = new URL(url);
    const fileName = path.basename(parsedUrl.pathname) || `file-${Date.now()}`;

    return {
      bytes,
      fileName,
      mimeType: response.headers.get('content-type') || 'application/octet-stream',
    };
  });

const readFileFromDisk = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  filePath: string,
  stagedFiles: StagedFiles
) =>
  Effect.gen(function* () {
    // Enforce the sensitive-path denylist at the lowest-level local read, so any
    // caller of this reader (not just `uploadToolInputFiles`) is protected. This
    // is the single canonical guard shared with `@composio/core`; without it the
    // CLI's upload path would silently exfiltrate ~/.ssh/id_rsa, ~/.aws/credentials,
    // .env files, etc. (issue #3746 / GHSA-hp3h-89pf-5q58). URLs and File objects
    // are intentionally not path-checked, matching the core SDK.
    //
    // The CLI intentionally exposes NO opt-out for this guard (unlike the core/Python
    // SDKs' `sensitiveFileUploadProtection` flag): the primary attack vector is an
    // agent that has been prompt-injected into supplying its own tool arguments, so a
    // `--force`/env override would hand that attacker a trivial bypass. Pass a
    // CLI-appropriate remediation so the error does not advertise an SDK-only opt-out.
    const { assertSafeFileUploadPath, getMimeTypeFromFileName } = yield* loadCoreFileUploadHelpers;
    yield* Effect.try({
      try: () =>
        assertSafeFileUploadPath(filePath, {
          remediation:
            'The Composio CLI always enforces this denylist and has no opt-out. To upload this ' +
            'file, copy it to a location outside sensitive directories (e.g. ~/.ssh, ~/.aws) and ' +
            'pass the copy instead.',
        }),
      catch: asSourceReadError,
    });
    const bytes = yield* fs.readFile(filePath).pipe(Effect.mapError(asSourceReadError));
    // A staged file is uploaded under the name and type its caller declared. A
    // local file carries no Content-Type, so otherwise the type is inferred from
    // the name's extension, as the core SDK does. Tools validate it (Canva's
    // import rejects a .pptx labelled `application/octet-stream`, #4984).
    const staged = stagedFiles.get(filePath);
    const stagedName = path.basename(staged?.name ?? '');
    const fileName = stagedName.length > 0 ? stagedName : path.basename(filePath);
    return {
      // Copy into a fresh ArrayBuffer-backed view: `fetch` bodies reject the
      // wider ArrayBufferLike-backed Uint8Array that FileSystem returns.
      bytes: new Uint8Array(bytes),
      fileName,
      mimeType: staged?.mimetype ?? getMimeTypeFromFileName(fileName),
    };
  });

const readUploadSource = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  file: string | File,
  stagedFiles: StagedFiles
) => {
  if (isFileLike(file)) {
    return Effect.tryPromise({ try: () => file.arrayBuffer(), catch: asSourceReadError }).pipe(
      Effect.map(buffer => ({
        bytes: new Uint8Array(buffer),
        fileName: file.name || `file-${Date.now()}`,
        mimeType: file.type || 'application/octet-stream',
      }))
    );
  }

  if (typeof file === 'string' && /^https?:\/\//i.test(file)) {
    return readFileFromUrl(path, file);
  }

  if (typeof file === 'string') {
    return readFileFromDisk(fs, path, file, stagedFiles);
  }

  return Effect.fail(
    new ToolFileUploadError({
      message: 'Unsupported upload source',
      reason: 'unsupported-source',
    })
  );
};

const uploadFile = (params: {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly file: string | File;
  readonly toolSlug: string;
  readonly toolkitSlug: string;
  readonly client: ComposioClientShape;
  readonly stagedFiles: StagedFiles;
}) =>
  Effect.gen(function* () {
    const fileData = yield* readUploadSource(
      params.fs,
      params.path,
      params.file,
      params.stagedFiles
    );
    // eslint-disable-next-line no-restricted-imports -- MD5 for the presigned-upload checksum is not available in Web Crypto
    const { createHash } = yield* Effect.promise(() => import('node:crypto'));
    const md5 = createHash('md5').update(fileData.bytes).digest('hex');
    // Issuing an upload URL changes nothing until the upload, so a retry is safe.
    const presigned = yield* params.client.files.createPresignedURL(
      {
        filename: fileData.fileName,
        mimetype: fileData.mimeType,
        md5,
        tool_slug: params.toolSlug,
        toolkit_slug: params.toolkitSlug,
      },
      idempotent
    );

    const { ssrfSafeFetch } = yield* loadSsrfSafeFetch;
    const uploadResponse = yield* Effect.tryPromise({
      try: signal =>
        ssrfSafeFetch(presigned.new_presigned_url, {
          method: 'PUT',
          body: fileData.bytes,
          headers: {
            'Content-Type': fileData.mimeType,
            'Content-Length': fileData.bytes.byteLength.toString(),
          },
          signal,
        }),
      catch: asSourceReadError,
    });

    yield* discardBody(uploadResponse);
    if (!uploadResponse.ok) {
      return yield* new ToolFileUploadError({
        message: `Failed to upload file to S3: ${uploadResponse.statusText}`,
        reason: 'upload',
        status: uploadResponse.status,
      });
    }

    return {
      name: fileData.fileName,
      mimetype: fileData.mimeType,
      s3key: presigned.key,
    };
  });

const hydrateFileUploads = (
  value: unknown,
  schema: JsonSchema | undefined,
  ctx: {
    readonly fs: FileSystem.FileSystem;
    readonly path: Path.Path;
    readonly toolSlug: string;
    readonly toolkitSlug: string;
    readonly client: ComposioClientShape;
    readonly stagedFiles: StagedFiles;
  }
): Effect.Effect<unknown, ToolInputUploadError> =>
  Effect.gen(function* () {
    if (schema?.file_uploadable === true) {
      if (typeof value !== 'string' && !isFileLike(value)) {
        return value;
      }

      return yield* uploadFile({
        fs: ctx.fs,
        path: ctx.path,
        file: value,
        toolSlug: ctx.toolSlug,
        toolkitSlug: ctx.toolkitSlug,
        client: ctx.client,
        stagedFiles: ctx.stagedFiles,
      });
    }

    const uploadableVariants = getSchemaVariants(schema).filter(schemaHasFileUploadable);
    if (uploadableVariants.length > 0) {
      let nextValue = value;
      for (const variant of uploadableVariants) {
        nextValue = yield* hydrateFileUploads(nextValue, variant, ctx);
      }
      return nextValue;
    }

    if (isSchemaRecord(schema?.properties) && Predicate.isObject(value)) {
      const properties = schema.properties;
      const entries = yield* Effect.all(
        Object.entries(value).map(([key, entryValue]) =>
          hydrateFileUploads(
            entryValue,
            isSchemaRecord(properties[key]) ? properties[key] : undefined,
            ctx
          ).pipe(Effect.map(hydrated => [key, hydrated] as const))
        ),
        { concurrency: 'unbounded' }
      );
      return Object.fromEntries(entries);
    }

    if (schema?.type === 'array' && Array.isArray(value) && schema.items) {
      const itemSchema = getItemSchemas(schema.items).at(0);

      return yield* Effect.all(
        value.map(item => hydrateFileUploads(item, itemSchema, ctx)),
        { concurrency: 'unbounded' }
      );
    }

    return value;
  });

export const uploadToolInputFiles = (params: {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly toolSlug: string;
  readonly arguments_: Record<string, unknown>;
  readonly inputSchema: JsonSchema;
  readonly client: ComposioClientShape;
  readonly toolkitSlug?: string;
  /** Local path -> name and MIME type its caller staged it under. */
  readonly stagedFiles?: StagedFiles;
}): Effect.Effect<Record<string, unknown>, ToolInputUploadError> =>
  Effect.gen(function* () {
    if (!schemaHasFileUploadable(params.inputSchema)) {
      return params.arguments_;
    }

    const hydrated = yield* hydrateFileUploads(params.arguments_, params.inputSchema, {
      fs: params.fs,
      path: params.path,
      toolSlug: params.toolSlug,
      toolkitSlug: params.toolkitSlug ?? guessToolkitFromToolSlug(params.toolSlug) ?? 'unknown',
      client: params.client,
      stagedFiles: params.stagedFiles ?? new Map(),
    });

    return Predicate.isObject(hydrated) ? hydrated : params.arguments_;
  });
