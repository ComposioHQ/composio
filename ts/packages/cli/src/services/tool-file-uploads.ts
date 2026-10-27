// The upload pipeline runs in the caller's fiber: the FileSystem read and the
// presigned-URL request are effects of their own, and the core SDK's
// promise-based helpers (the path and URL guards, the body reader, the upload
// transport) are wrapped at each call. The caller resolves the platform
// services and the Composio client and passes the instances in as parameters.
import type * as FileSystem from 'effect/FileSystem';
import type * as Path from 'effect/Path';
import type { ComposioClientShape, ComposioError } from '@composio/client/effect';
import { Data, Effect, Predicate } from 'effect';
import mime from 'mime';
import { guessToolkitFromToolSlug } from 'src/utils/toolkit-from-tool-slug';
import { idempotent } from 'src/services/composio-request';

type JsonSchema = Record<string, unknown>;

// The three core helpers below are only reached once an execute actually carries
// a file input, so they are imported on that path rather than at module scope:
// `@composio/core`'s root entry evaluates the whole SDK, which every command
// would otherwise pay for at startup. The module registry memoizes the import.
const loadCoreFileUploadHelpers = Effect.promise(() => import('@composio/core'));
const loadSsrfSafeFetch = Effect.promise(() => import('@composio/core/utils/ssrf-guard'));

export class ToolFileUploadError extends Data.TaggedError('services/ToolFileUploadError')<{
  readonly cause?: unknown;
  readonly message: string;
  readonly reason:
    'not-uploadable' | 'source-fetch' | 'source-read' | 'unsupported-source' | 'upload';
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

// Releases a body this module does not read, ignoring a cancellation failure.
const discardBody = (response: Response) =>
  Effect.ignore(Effect.tryPromise(() => response.body?.cancel() ?? Promise.resolve()));

const isFileLike = (value: unknown): value is File =>
  typeof File !== 'undefined' && value instanceof File;

const isSchemaRecord = (value: unknown): value is JsonSchema => Predicate.isObject(value);

const getSchemaVariant = (value: unknown): ReadonlyArray<JsonSchema> =>
  Array.isArray(value) ? value.filter(isSchemaRecord) : [];

// `items` is either one schema for every element or a tuple of per-index schemas.
const itemSchemaAt = (items: unknown, index: number): JsonSchema | undefined => {
  const itemSchema = Array.isArray(items) ? items[index] : items;
  return isSchemaRecord(itemSchema) ? itemSchema : undefined;
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

// Whether a branch can describe the value, judged by its `const` properties.
// A supplied property with another value rules the branch out, as does a
// required one the caller left out; an omitted optional one rules nothing out.
const matchesDiscriminants = (schema: JsonSchema, value: unknown): boolean => {
  if (!isSchemaRecord(schema.properties) || !isSchemaRecord(value)) return true;
  const required = Array.isArray(schema.required) ? schema.required : [];
  return Object.entries(schema.properties).every(([key, property]) => {
    if (!isSchemaRecord(property) || !Object.hasOwn(property, 'const')) return true;
    if (!Object.hasOwn(value, key)) return !required.includes(key);
    return value[key] === property.const;
  });
};

// Bind array schemas to the caller's existing items. A schema-only path loses
// the index and would cause --file to replace the array with an object.
export const findFileUploadablePaths = (
  schema: JsonSchema | undefined,
  basePath: ReadonlyArray<string | number> = [],
  value?: unknown
): ReadonlyArray<ReadonlyArray<string | number>> => {
  if (!schema) return [];

  if (schema.file_uploadable === true) {
    return [basePath];
  }

  const directPropertyPaths = isSchemaRecord(schema.properties)
    ? Object.entries(schema.properties).flatMap(([key, property]) =>
        isSchemaRecord(property)
          ? findFileUploadablePaths(
              property,
              [...basePath, key],
              isSchemaRecord(value) ? value[key] : undefined
            )
          : []
      )
    : [];

  const variantPaths = getSchemaVariants(schema)
    .filter(variant => matchesDiscriminants(variant, value))
    .flatMap(variant => findFileUploadablePaths(variant, basePath, value));

  const itemPaths = Array.isArray(value)
    ? value.flatMap((item, index) =>
        findFileUploadablePaths(itemSchemaAt(schema.items, index), [...basePath, index], item)
      )
    : [];

  const seen = new Set<string>();
  return [...directPropertyPaths, ...variantPaths, ...itemPaths].filter(pathParts => {
    const key = JSON.stringify(pathParts);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// Wording of inputs that take a file on the caller's machine, as the tool
// catalog writes it: "Path to the local file to attach", "Local filesystem path
// to the file to upload", "Path to the file to upload".
const LOCAL_FILE_DESCRIPTION =
  /\blocal(?:ly)?[\s-]+(?:file|path|filesystem|file\s*system|disk)\b|\bpath\b[^.]{0,40}\bfile\b[^.]{0,40}\bupload/i;

const describesLocalFile = (schema: JsonSchema): boolean =>
  [schema.title, schema.description].some(
    text => Predicate.isString(text) && LOCAL_FILE_DESCRIPTION.test(text)
  );

// A path-shaped value: a separator or an extension, and no URL scheme. Keeps a
// bare word such as "claude_code" from matching a file of that name.
const looksLikeFilePath = (path: Path.Path, value: string): boolean =>
  !/^[a-z][a-z0-9+.-]*:\/\//i.test(value) &&
  (value.includes('/') || value.includes('\\') || path.extname(value) !== '');

type LocalPathArgument = {
  readonly argumentPath: ReadonlyArray<string>;
  readonly value: string;
};

/**
 * The schema and every `anyOf`/`oneOf`/`allOf` branch under it, at any depth:
 * all the schemas that can describe one value. Schemas are parsed JSON, so the
 * walk ends, as `findFileUploadablePaths` does on the same schema.
 */
const schemasForValue = (schema: JsonSchema): ReadonlyArray<JsonSchema> => [
  schema,
  ...getSchemaVariants(schema).flatMap(schemasForValue),
];

/**
 * Where `hydrateFileUploads` uploads a value: the same walk, without the
 * upload. The guard exempts exactly these locations.
 */
const uploadedArgumentPaths = (
  value: unknown,
  schema: JsonSchema | undefined,
  argumentPath: ReadonlyArray<string>
): ReadonlyArray<ReadonlyArray<string>> => {
  if (schema?.file_uploadable === true) {
    return Predicate.isString(value) || isFileLike(value) ? [argumentPath] : [];
  }

  const uploadableVariants = getSchemaVariants(schema).filter(schemaHasFileUploadable);
  if (uploadableVariants.length > 0) {
    return uploadableVariants.flatMap(variant =>
      uploadedArgumentPaths(value, variant, argumentPath)
    );
  }

  const properties = schema?.properties;
  if (isSchemaRecord(properties) && Predicate.isObject(value)) {
    return Object.entries(value).flatMap(([key, entry]) =>
      uploadedArgumentPaths(entry, isSchemaRecord(properties[key]) ? properties[key] : undefined, [
        ...argumentPath,
        key,
      ])
    );
  }

  if (schema?.type === 'array' && Array.isArray(value) && schema.items) {
    return value.flatMap((item, index) =>
      uploadedArgumentPaths(item, itemSchemaAt(schema.items, index), [
        ...argumentPath,
        String(index),
      ])
    );
  }

  return [];
};

const collectLocalPathCandidates = (
  value: unknown,
  schemas: ReadonlyArray<JsonSchema>,
  argumentPath: ReadonlyArray<string>
): ReadonlyArray<LocalPathArgument> => {
  const nodes = schemas.flatMap(schemasForValue);

  if (Predicate.isString(value)) {
    return nodes.some(describesLocalFile) ? [{ argumentPath, value }] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectLocalPathCandidates(
        item,
        nodes.flatMap(node => {
          const itemSchema = itemSchemaAt(node.items, index);
          return itemSchema ? [itemSchema] : [];
        }),
        [...argumentPath, String(index)]
      )
    );
  }

  if (Predicate.isObject(value)) {
    return Object.entries(value).flatMap(([key, entry]) =>
      collectLocalPathCandidates(
        entry,
        nodes.flatMap(node => {
          const property = isSchemaRecord(node.properties) ? node.properties[key] : undefined;
          return isSchemaRecord(property) ? [property] : [];
        }),
        [...argumentPath, key]
      )
    );
  }

  return [];
};

/**
 * The string arguments a schema describes as a local file without marking
 * them `file_uploadable`. Composio runs the tool remotely and only uploads
 * `file_uploadable` inputs, so such an argument reaches the tool as the text of
 * the path, never as the file. Every branch that applies to a value is read
 * for the description, and a value `hydrateFileUploads` uploads is never
 * returned.
 */
export const findLocalPathArguments = (
  value: unknown,
  schema: JsonSchema | undefined
): ReadonlyArray<LocalPathArgument> => {
  if (!schema) return [];
  const uploaded = new Set(
    uploadedArgumentPaths(value, schema, []).map(parts => JSON.stringify(parts))
  );
  return collectLocalPathCandidates(value, [schema], []).filter(
    candidate => !uploaded.has(JSON.stringify(candidate.argumentPath))
  );
};

/**
 * Fails when an argument the schema describes as a local file names a file
 * that exists on this machine but the input is not `file_uploadable`: the tool
 * would get the path text instead of the file and still report success
 * (issue #4965). A path that does not exist here is left alone, since it may
 * name a file on the remote side.
 */
export const rejectLocalFilesWithoutUpload = (params: {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly toolSlug: string;
  readonly arguments_: Record<string, unknown>;
  readonly inputSchema: JsonSchema;
}) =>
  Effect.gen(function* () {
    const candidates = findLocalPathArguments(params.arguments_, params.inputSchema).filter(
      candidate => looksLikeFilePath(params.path, candidate.value)
    );
    const localFiles = yield* Effect.filter(candidates, candidate =>
      params.fs.stat(candidate.value).pipe(
        Effect.map(info => info.type === 'File'),
        Effect.orElseSucceed(() => false)
      )
    );
    if (localFiles.length === 0) return;

    const named = localFiles
      .map(({ argumentPath, value }) => `"${argumentPath.join('.')}" (${value})`)
      .join(', ');
    return yield* new ToolFileUploadError({
      reason: 'not-uploadable',
      message:
        `${params.toolSlug} cannot upload local files: ${named} names a file on this machine, ` +
        'but the tool does not mark that input as a file upload, so Composio would receive the ' +
        'path text instead of the file content. Nothing was executed. Use a URL input if the ' +
        'tool has one, or report the tool schema to Composio.',
    });
  });

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

const readFileFromDisk = (fs: FileSystem.FileSystem, path: Path.Path, filePath: string) =>
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
    const { assertSafeFileUploadPath } = yield* loadCoreFileUploadHelpers;
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
    return {
      // Copy into a fresh ArrayBuffer-backed view: `fetch` bodies reject the
      // wider ArrayBufferLike-backed Uint8Array that FileSystem returns.
      bytes: new Uint8Array(bytes),
      fileName: path.basename(filePath),
      mimeType: mime.getType(path.basename(filePath)) ?? 'application/octet-stream',
    };
  });

const readUploadSource = (fs: FileSystem.FileSystem, path: Path.Path, file: string | File) => {
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
    return readFileFromDisk(fs, path, file);
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
}) =>
  Effect.gen(function* () {
    const fileData = yield* readUploadSource(params.fs, params.path, params.file);
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
      return yield* Effect.all(
        value.map((item, index) =>
          hydrateFileUploads(item, itemSchemaAt(schema.items, index), ctx)
        ),
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
}): Effect.Effect<Record<string, unknown>, ToolInputUploadError> =>
  Effect.gen(function* () {
    yield* rejectLocalFilesWithoutUpload(params);

    if (!schemaHasFileUploadable(params.inputSchema)) {
      return params.arguments_;
    }

    const hydrated = yield* hydrateFileUploads(params.arguments_, params.inputSchema, {
      fs: params.fs,
      path: params.path,
      toolSlug: params.toolSlug,
      toolkitSlug: params.toolkitSlug ?? guessToolkitFromToolSlug(params.toolSlug) ?? 'unknown',
      client: params.client,
    });

    return Predicate.isObject(hydrated) ? hydrated : params.arguments_;
  });
