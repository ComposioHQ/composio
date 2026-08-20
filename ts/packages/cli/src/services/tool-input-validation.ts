import { AutoCorrect, CliConfig } from '@effect/cli';
import { FileSystem, Path } from '@effect/platform';
import { Data, Effect, Option, ParseResult, Schema } from 'effect';
import { getLocalToolInputDefinition } from '@composio/cli-local-tools';
import {
  jsonSchemaToEffectSchema,
  type JsonSchemaValidationIssue,
} from '@composio/json-schema-to-effect-schema';
import { JsonRecordSchema } from 'src/effects/json';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { ComposioToolkitsRepository, getLatestToolVersion } from 'src/services/composio-clients';
import { logToolDebug } from 'src/services/runtime-debug-logger';
import { normalizeFileUploadSchema } from 'src/services/tool-file-uploads';
import { ComposioUserContext } from 'src/services/user-context';

const TOOL_DEFINITIONS_DIR = 'tool_definitions';

type CachedToolInputDefinition = {
  readonly version: string | null;
  readonly inputSchema: Record<string, unknown>;
};

const CachedToolInputDefinitionEnvelope = Schema.Struct({
  version: Schema.optional(Schema.Unknown),
  inputSchema: JsonRecordSchema,
});
const ObjectSchemaWithProperties = Schema.Struct({ properties: JsonRecordSchema });

const decodeJsonObject = Schema.decodeUnknown(Schema.parseJson(JsonRecordSchema));
const decodeCachedToolInputDefinitionEnvelope = Schema.decodeUnknownOption(
  CachedToolInputDefinitionEnvelope
);
const decodeObjectSchemaWithProperties = Schema.decodeUnknownOption(ObjectSchemaWithProperties);

const sanitizeToolSlug = (slug: string) => slug.replace(/[^A-Za-z0-9_.-]/g, '_');

const toolDefinitionPath = (path: Path.Path, cacheDir: string, slug: string) =>
  path.join(cacheDir, TOOL_DEFINITIONS_DIR, `${sanitizeToolSlug(slug)}.json`);

const ensureToolDefinitionsDir = (fs: FileSystem.FileSystem, path: Path.Path, cacheDir: string) =>
  fs.makeDirectory(path.join(cacheDir, TOOL_DEFINITIONS_DIR), { recursive: true });

const parseSchemaFile = (raw: string, schemaPath: string) =>
  decodeJsonObject(raw).pipe(
    Effect.mapError(
      cause => new Error(`Cached tool schema at ${schemaPath} is not valid JSON.`, { cause })
    )
  );

const PLACEHOLDER_TOOL_VERSION = '00000000_00';

const selectLatestVersion = (versions: ReadonlyArray<string> | undefined): string | null => {
  if (!versions || versions.length === 0) {
    return null;
  }

  for (const version of versions) {
    if (
      typeof version === 'string' &&
      version.trim().length > 0 &&
      version !== PLACEHOLDER_TOOL_VERSION
    ) {
      return version;
    }
  }

  return versions.find(version => typeof version === 'string' && version.trim().length > 0) ?? null;
};

const resolveLatestAvailableVersion = (params: {
  readonly toolLatestVersion: string | null;
  readonly toolkitLatestVersion: string | null;
}): string | null => {
  if (
    params.toolLatestVersion &&
    params.toolLatestVersion.trim().length > 0 &&
    params.toolLatestVersion !== PLACEHOLDER_TOOL_VERSION
  ) {
    return params.toolLatestVersion;
  }

  return params.toolkitLatestVersion;
};

const parseCachedToolDefinition = (parsed: Record<string, unknown>): CachedToolInputDefinition => {
  const envelope = decodeCachedToolInputDefinitionEnvelope(parsed);
  if (Option.isSome(envelope)) {
    return {
      version: typeof envelope.value.version === 'string' ? envelope.value.version : null,
      inputSchema: envelope.value.inputSchema,
    };
  }

  // Backward compatibility for previously cached bare-schema files.
  return {
    version: null,
    inputSchema: parsed,
  };
};

const serializeCachedToolDefinition = (definition: CachedToolInputDefinition): string =>
  JSON.stringify(
    {
      version: definition.version,
      inputSchema: definition.inputSchema,
    },
    null,
    2
  );

export const getCachedToolInputDefinition = (slug: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cacheDir = yield* setupCacheDir;
    const schemaPath = toolDefinitionPath(path, cacheDir, slug);

    const raw = yield* fs
      .readFileString(schemaPath, 'utf8')
      .pipe(
        Effect.catchTag('SystemError', error =>
          error.reason === 'NotFound' ? Effect.succeed(null) : Effect.fail(error)
        )
      );
    if (raw === null) {
      return null;
    }

    const parsed = yield* parseSchemaFile(raw, schemaPath);
    const cached = parseCachedToolDefinition(parsed);
    return {
      schemaPath,
      schema: cached.inputSchema,
      version: cached.version,
    };
  });

export const getToolDefinitionCachePath = (slug: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const cacheDir = yield* setupCacheDir;
    return toolDefinitionPath(path, cacheDir, slug);
  });

export const cacheToolInputDefinition = (params: {
  readonly slug: string;
  readonly schema: Record<string, unknown>;
  readonly version?: string | null;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cacheDir = yield* setupCacheDir;
    const schemaPath = toolDefinitionPath(path, cacheDir, params.slug);

    yield* ensureToolDefinitionsDir(fs, path, cacheDir);
    yield* fs.writeFileString(
      schemaPath,
      serializeCachedToolDefinition({
        version: params.version ?? null,
        inputSchema: params.schema,
      })
    );

    return {
      schemaPath,
      schema: params.schema,
      version: params.version ?? null,
    };
  });

export const invalidateToolInputDefinition = (slug: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cacheDir = yield* setupCacheDir;
    const schemaPath = toolDefinitionPath(path, cacheDir, slug);
    yield* fs
      .remove(schemaPath)
      .pipe(
        Effect.catchTag('SystemError', error =>
          error.reason === 'NotFound' ? Effect.void : Effect.fail(error)
        )
      );
  });

const fetchResolvedLatestToolVersion = (
  slug: string,
  params?: { readonly orgId?: string; readonly projectId?: string }
) =>
  Effect.gen(function* () {
    const userContext = yield* ComposioUserContext;
    const apiKey = Option.getOrUndefined(userContext.data.apiKey);
    if (!apiKey) {
      return null;
    }

    const latest = yield* getLatestToolVersion({
      baseURL: userContext.data.baseURL,
      apiKey,
      toolSlug: slug,
      orgId: params?.orgId,
      projectId: params?.projectId,
    });
    yield* logToolDebug('latest_tool_version', {
      slug,
      orgId: params?.orgId,
      projectId: params?.projectId,
      response: latest,
    });
    return latest.version;
  });

const fetchAndCacheToolInputDefinition = (
  slug: string,
  params?: { readonly orgId?: string; readonly projectId?: string }
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const repo = yield* ComposioToolkitsRepository;
    const cacheDir = yield* setupCacheDir;
    const localDefinition = getLocalToolInputDefinition(slug);
    const schemaPath = toolDefinitionPath(path, cacheDir, localDefinition?.finalSlug ?? slug);
    yield* ensureToolDefinitionsDir(fs, path, cacheDir);

    if (localDefinition) {
      yield* fs.writeFileString(
        schemaPath,
        serializeCachedToolDefinition({
          version: localDefinition.version,
          inputSchema: localDefinition.schema,
        })
      );
      return {
        schemaPath,
        schema: localDefinition.schema,
        version: localDefinition.version,
      };
    }

    const [tool, latestVersion] = yield* Effect.all(
      [
        repo.getToolDetailed(slug),
        fetchResolvedLatestToolVersion(slug, params).pipe(
          Effect.catchAll(() => Effect.succeed(null))
        ),
      ],
      { concurrency: 2 }
    );
    yield* logToolDebug('tool_detail', {
      slug,
      tool,
    });
    const schema = tool.input_parameters;
    const version =
      latestVersion ??
      resolveLatestAvailableVersion({
        toolLatestVersion: selectLatestVersion(tool.available_versions),
        toolkitLatestVersion: null,
      });
    yield* logToolDebug('resolved_tool_version', {
      slug,
      resolvedVersion: version,
      cachePath: schemaPath,
    });
    yield* fs.writeFileString(
      schemaPath,
      serializeCachedToolDefinition({
        version,
        inputSchema: schema,
      })
    );

    return { schemaPath, schema, version };
  });

export const getOrFetchToolInputDefinition = (
  slug: string,
  params?: { readonly orgId?: string; readonly projectId?: string }
) =>
  Effect.gen(function* () {
    const cached = yield* getCachedToolInputDefinition(slug);
    if (!cached) {
      return yield* fetchAndCacheToolInputDefinition(slug, params);
    }

    const freshness = yield* refreshAndFetchToolInputDefinitionIfVersionChanged(
      slug,
      cached.version,
      params
    ).pipe(
      Effect.catchAll(() =>
        Effect.succeed({
          isStale: false,
          latestVersion: cached.version,
          definition: null,
          skipped: false as const,
        })
      )
    );

    if (!freshness.isStale) {
      return cached;
    }

    return freshness.definition ?? cached;
  });

// Returns the freshly fetched definition on the stale path so callers that
// need it (getOrFetchToolInputDefinition) don't re-read the cache file that
// fetchAndCacheToolInputDefinition just wrote.
const refreshAndFetchToolInputDefinitionIfVersionChanged = (
  slug: string,
  cachedVersion: string | null,
  params?: { readonly orgId?: string; readonly projectId?: string }
) =>
  Effect.gen(function* () {
    const latestVersion = yield* fetchResolvedLatestToolVersion(slug, params);
    yield* logToolDebug('resolved_tool_version', {
      slug,
      mode: 'refresh',
      cachedVersion,
      resolvedVersion: latestVersion,
      orgId: params?.orgId,
      projectId: params?.projectId,
    });
    const isStale = latestVersion !== cachedVersion;
    const definition = isStale ? yield* fetchAndCacheToolInputDefinition(slug, params) : null;

    return { isStale, latestVersion, definition, skipped: false as const };
  });

export const refreshToolInputDefinitionIfVersionChanged = (
  slug: string,
  cachedVersion: string | null,
  params?: { readonly orgId?: string; readonly projectId?: string }
) =>
  refreshAndFetchToolInputDefinitionIfVersionChanged(slug, cachedVersion, params).pipe(
    Effect.map(({ isStale, latestVersion, skipped }) => ({ isStale, latestVersion, skipped }))
  );

export class ToolInputValidationError extends Data.TaggedError('ToolInputValidationError')<{
  readonly toolSlug: string;
  readonly schemaPath: string;
  readonly issues: ReadonlyArray<string>;
  readonly cause?: unknown;
}> {
  override get message(): string {
    return [
      `Input validation failed for ${this.toolSlug}.`,
      `Schema: ${this.schemaPath}`,
      ...this.issues.map(issue => `- ${issue}`),
    ].join('\n');
  }
}

const getObjectSchemaProperties = (schema: Record<string, unknown>): ReadonlyArray<string> => {
  const objectSchema = decodeObjectSchemaWithProperties(schema);
  return Option.isSome(objectSchema) ? Object.keys(objectSchema.value.properties) : [];
};

const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const schemaKeySuggestionConfig = CliConfig.defaultConfig;

type SchemaKeyCandidate = {
  readonly key: string;
  readonly score: number;
};

const findClosestSchemaKey = (
  unknownKey: string,
  allowedKeys: ReadonlyArray<string>
): string | undefined => {
  const normalizedUnknownKey = normalizeKey(unknownKey);
  if (!normalizedUnknownKey) {
    return undefined;
  }

  const closest = allowedKeys.reduce<SchemaKeyCandidate | undefined>((best, key) => {
    const normalizedKey = normalizeKey(key);
    const distance = AutoCorrect.levensteinDistance(
      normalizedUnknownKey,
      normalizedKey,
      schemaKeySuggestionConfig
    );
    const containsBonus =
      normalizedKey.includes(normalizedUnknownKey) || normalizedUnknownKey.includes(normalizedKey)
        ? -2
        : 0;
    const candidate = {
      key,
      score: distance + containsBonus,
    };

    if (!best || candidate.score < best.score) {
      return candidate;
    }

    return best;
  }, undefined);

  const threshold = Math.max(3, Math.ceil(normalizedUnknownKey.length * 0.6));
  if (!closest || closest.score > threshold) {
    return undefined;
  }

  return closest.key;
};

const formatUnknownKeyIssue = (
  unknownKeys: ReadonlyArray<string>,
  allowedKeys: ReadonlyArray<string>
): ReadonlyArray<string> => {
  const allowedList = allowedKeys.join(', ');
  return unknownKeys.map(key => {
    const suggestion = findClosestSchemaKey(key, allowedKeys);
    const lines = [`<root>: Unknown key "${key}".`];
    if (suggestion) {
      lines.push(`Use "${suggestion}" instead.`);
    }
    if (allowedList) {
      lines.push(`Allowed top-level keys: ${allowedList}`);
    }
    return lines.join(' ');
  });
};

const formatSchemaIssues = (
  schemaIssues: ReadonlyArray<JsonSchemaValidationIssue>,
  allowedKeys: ReadonlyArray<string>
): ReadonlyArray<string> =>
  schemaIssues.flatMap(issue => {
    if (issue.code === 'unrecognized_keys' && issue.keys) {
      return formatUnknownKeyIssue(issue.keys, allowedKeys);
    }

    const location = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    return [`${location}: ${issue.message}`];
  });

const compileToolInputSchema = (
  jsonSchema: Record<string, unknown>,
  allowedKeys: ReadonlyArray<string>
) =>
  jsonSchemaToEffectSchema(jsonSchema, {
    formatIssues: issues => formatSchemaIssues(issues, allowedKeys),
  });

export const validateToolInputArgumentsWithDefinition = (
  slug: string,
  args: Record<string, unknown>,
  definition: {
    readonly schemaPath: string;
    readonly schema: Record<string, unknown>;
  }
) =>
  Effect.gen(function* () {
    const { schemaPath, schema } = definition;
    const allowedKeys = getObjectSchemaProperties(schema);
    const normalizedSchema = normalizeFileUploadSchema(schema);

    const inputSchema = yield* Effect.try({
      try: () => compileToolInputSchema(normalizedSchema, allowedKeys),
      catch: error =>
        new ToolInputValidationError({
          toolSlug: slug,
          schemaPath,
          issues: ['Could not compile the cached JSON schema into a validator.'],
          cause: error,
        }),
    });

    yield* Schema.decodeUnknown(inputSchema, { errors: 'all' })(args).pipe(
      Effect.mapError(error => {
        const issues = ParseResult.ArrayFormatter.formatErrorSync(error).map(
          issue => issue.message
        );
        return new ToolInputValidationError({ toolSlug: slug, schemaPath, issues, cause: error });
      })
    );

    return { schemaPath, schema };
  });

export const validateToolInputArgumentsIfCached = (slug: string, args: Record<string, unknown>) =>
  Effect.gen(function* () {
    const cached = yield* getCachedToolInputDefinition(slug);
    if (!cached) {
      return false as const;
    }

    yield* validateToolInputArgumentsWithDefinition(slug, args, cached);
    return true as const;
  });

export const validateToolInputArguments = (
  slug: string,
  args: Record<string, unknown>,
  params?: { readonly orgId?: string; readonly projectId?: string }
) =>
  Effect.gen(function* () {
    const definition = yield* getOrFetchToolInputDefinition(slug, params);
    return yield* validateToolInputArgumentsWithDefinition(slug, args, definition);
  });

export const warmToolInputDefinitions = (slugs: ReadonlyArray<string>) =>
  Effect.forEach([...new Set(slugs)].filter(Boolean), slug => getOrFetchToolInputDefinition(slug), {
    concurrency: 'unbounded',
    discard: true,
  });
