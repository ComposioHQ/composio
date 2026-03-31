import path from 'node:path';
import { FileSystem } from '@effect/platform';
import { Effect, Option } from 'effect';
import { jsonSchemaToZodSchema } from '@composio/core';
import { z } from 'zod/v3';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { ComposioToolkitsRepository, getLatestToolVersion } from 'src/services/composio-clients';
import { isToolDebugEnabled } from 'src/services/runtime-debug-flags';
import { normalizeFileUploadSchema } from 'src/services/tool-file-uploads';
import { ComposioUserContext } from 'src/services/user-context';

const TOOL_DEFINITIONS_DIR = 'tool_definitions';

type CachedToolInputDefinition = {
  readonly version: string | null;
  readonly inputSchema: Record<string, unknown>;
};

const sanitizeToolSlug = (slug: string) => slug.replace(/[^A-Za-z0-9_.-]/g, '_');

const toolDefinitionPath = (cacheDir: string, slug: string) =>
  path.join(cacheDir, TOOL_DEFINITIONS_DIR, `${sanitizeToolSlug(slug)}.json`);

const ensureToolDefinitionsDir = (fs: FileSystem.FileSystem, cacheDir: string) =>
  fs.makeDirectory(path.join(cacheDir, TOOL_DEFINITIONS_DIR), { recursive: true });

const parseSchemaFile = (raw: string, schemaPath: string) =>
  Effect.try({
    try: () => JSON.parse(raw) as Record<string, unknown>,
    catch: () => new Error(`Cached tool schema at ${schemaPath} is not valid JSON.`),
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

const toolDebugLog = (label: string, details: Record<string, unknown>) => {
  if (!isToolDebugEnabled()) return;
  console.error(`[tool-debug] ${JSON.stringify({ label, ...details })}`);
};

const parseCachedToolDefinition = (parsed: Record<string, unknown>): CachedToolInputDefinition => {
  const inputSchema = parsed.inputSchema;
  if (isRecord(inputSchema)) {
    return {
      version: typeof parsed.version === 'string' ? parsed.version : null,
      inputSchema,
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
    const cacheDir = yield* setupCacheDir;
    const schemaPath = toolDefinitionPath(cacheDir, slug);

    if (!(yield* fs.exists(schemaPath))) {
      return null;
    }

    const raw = yield* fs.readFileString(schemaPath, 'utf8');
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
    const cacheDir = yield* setupCacheDir;
    return toolDefinitionPath(cacheDir, slug);
  });

export const invalidateToolInputDefinition = (slug: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const cacheDir = yield* setupCacheDir;
    const schemaPath = toolDefinitionPath(cacheDir, slug);
    if (yield* fs.exists(schemaPath)) {
      yield* fs.remove(schemaPath);
    }
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
    toolDebugLog('latest_tool_version', {
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
    const repo = yield* ComposioToolkitsRepository;
    const cacheDir = yield* setupCacheDir;
    const schemaPath = toolDefinitionPath(cacheDir, slug);
    yield* ensureToolDefinitionsDir(fs, cacheDir);

    const tool = yield* repo.getToolDetailed(slug);
    toolDebugLog('tool_detail', {
      slug,
      tool,
    });
    const schema = (tool.input_parameters ?? {}) as Record<string, unknown>;
    const version =
      (yield* fetchResolvedLatestToolVersion(slug, params).pipe(
        Effect.catchAll(() => Effect.succeed(null))
      )) ??
      resolveLatestAvailableVersion({
        toolLatestVersion: selectLatestVersion(tool.available_versions),
        toolkitLatestVersion: null,
      });
    toolDebugLog('resolved_tool_version', {
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

    const freshness = yield* refreshToolInputDefinitionIfVersionChanged(
      slug,
      cached.version,
      params
    ).pipe(
      Effect.catchAll(() =>
        Effect.succeed({
          isStale: false,
          latestVersion: cached.version,
          skipped: false as const,
        })
      )
    );

    if (!freshness.isStale) {
      return cached;
    }

    const refreshed = yield* getCachedToolInputDefinition(slug);
    return refreshed ?? (yield* fetchAndCacheToolInputDefinition(slug, params));
  });

export const refreshToolInputDefinitionIfVersionChanged = (
  slug: string,
  cachedVersion: string | null,
  params?: { readonly orgId?: string; readonly projectId?: string }
) =>
  Effect.gen(function* () {
    const latestVersion = yield* fetchResolvedLatestToolVersion(slug, params);
    toolDebugLog('resolved_tool_version', {
      slug,
      mode: 'refresh',
      cachedVersion,
      resolvedVersion: latestVersion,
      orgId: params?.orgId,
      projectId: params?.projectId,
    });
    const isStale = latestVersion !== cachedVersion;

    if (isStale) {
      yield* fetchAndCacheToolInputDefinition(slug, params);
    }

    return { isStale, latestVersion, skipped: false as const };
  });

export class ToolInputValidationError extends Error {
  readonly _tag = 'ToolInputValidationError';

  constructor(
    readonly toolSlug: string,
    readonly schemaPath: string,
    readonly issues: ReadonlyArray<string>,
    options?: ErrorOptions
  ) {
    super(
      [
        `Input validation failed for ${toolSlug}.`,
        `Schema: ${schemaPath}`,
        ...issues.map(issue => `- ${issue}`),
      ].join('\n'),
      options
    );
  }
}

const getObjectSchemaProperties = (schema: Record<string, unknown>): ReadonlyArray<string> => {
  const properties = schema.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return [];
  }

  return Object.keys(properties as Record<string, unknown>);
};

const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const levenshteinDistance = (left: string, right: string): number => {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let i = 0; i < left.length; i += 1) {
    current[0] = i + 1;
    for (let j = 0; j < right.length; j += 1) {
      const cost = left[i] === right[j] ? 0 : 1;
      current[j + 1] = Math.min(current[j]! + 1, previous[j + 1]! + 1, previous[j]! + cost);
    }
    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j]!;
    }
  }

  return previous[right.length]!;
};

const findClosestSchemaKey = (
  unknownKey: string,
  allowedKeys: ReadonlyArray<string>
): string | undefined => {
  const normalizedUnknownKey = normalizeKey(unknownKey);
  const candidates = allowedKeys
    .map(key => ({
      key,
      normalized: normalizeKey(key),
    }))
    .map(candidate => {
      const distance = levenshteinDistance(normalizedUnknownKey, candidate.normalized);
      const containsBonus =
        candidate.normalized.includes(normalizedUnknownKey) ||
        normalizedUnknownKey.includes(candidate.normalized)
          ? -2
          : 0;
      return {
        key: candidate.key,
        score: distance + containsBonus,
      };
    })
    .sort((left, right) => left.score - right.score);

  const best = candidates[0];
  if (!best) {
    return undefined;
  }

  const threshold = Math.max(3, Math.ceil(normalizedUnknownKey.length * 0.6));
  return best.score <= threshold ? best.key : undefined;
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

    const zodSchema = yield* Effect.try({
      try: () => jsonSchemaToZodSchema<z.ZodTypeAny>(normalizedSchema),
      catch: error =>
        new ToolInputValidationError(
          slug,
          schemaPath,
          ['Could not compile the cached JSON schema into a Zod validator.'],
          { cause: error }
        ),
    });

    const parsed = zodSchema.safeParse(args);
    if (parsed.success) {
      return { schemaPath, schema };
    }

    const issues = parsed.error.issues.flatMap(issue => {
      if (issue.code === 'unrecognized_keys') {
        return formatUnknownKeyIssue(issue.keys, allowedKeys);
      }
      const location = issue.path.length > 0 ? issue.path.join('.') : '<root>';
      return [`${location}: ${issue.message}`];
    });

    return yield* Effect.fail(new ToolInputValidationError(slug, schemaPath, issues));
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
