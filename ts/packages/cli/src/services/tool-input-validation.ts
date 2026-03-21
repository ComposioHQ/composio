import path from 'node:path';
import { FileSystem } from '@effect/platform';
import { Effect } from 'effect';
import { jsonSchemaToZodSchema } from '@composio/core';
import { z } from 'zod/v3';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';

const TOOL_DEFINITIONS_DIR = 'tool_definitions';
const toolDebugEnabled = process.env.COMPOSIO_TOOL_DEBUG === '1';

type CachedToolInputDefinition = {
  readonly version: string | null;
  readonly versionCheckedAt: string | null;
  readonly inputSchema: Record<string, unknown>;
};

const VERSION_CHECK_TTL_MS = 12 * 60 * 60 * 1000;

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
    if (version && version !== PLACEHOLDER_TOOL_VERSION) {
      return version;
    }
  }

  return versions[0] ?? null;
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
  if (!toolDebugEnabled) return;
  console.error(`[tool-debug] ${JSON.stringify({ label, ...details })}`);
};

const parseCachedToolDefinition = (
  parsed: Record<string, unknown>
): CachedToolInputDefinition => {
  const inputSchema = parsed.inputSchema;
  if (isRecord(inputSchema)) {
    return {
      version: typeof parsed.version === 'string' ? parsed.version : null,
      versionCheckedAt:
        typeof parsed.versionCheckedAt === 'string' ? parsed.versionCheckedAt : null,
      inputSchema,
    };
  }

  // Backward compatibility for previously cached bare-schema files.
  return {
    version: null,
    versionCheckedAt: null,
    inputSchema: parsed,
  };
};

const serializeCachedToolDefinition = (definition: CachedToolInputDefinition): string =>
  JSON.stringify(
    {
      version: definition.version,
      versionCheckedAt: definition.versionCheckedAt,
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
      versionCheckedAt: cached.versionCheckedAt,
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

export const getOrFetchToolInputDefinition = (slug: string) =>
  Effect.gen(function* () {
    const cached = yield* getCachedToolInputDefinition(slug);
    if (cached) {
      return cached;
    }

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
    const toolkitLatestVersion =
      tool.toolkit.slug.length > 0
        ? (
            yield* repo.getToolkitDetailed(tool.toolkit.slug).pipe(
              Effect.tap(toolkit =>
                Effect.sync(() =>
                  toolDebugLog('toolkit_detail', {
                    slug,
                    toolkitSlug: tool.toolkit.slug,
                    toolkit,
                  })
                )
              ),
              Effect.map(toolkit => selectLatestVersion(toolkit.meta.available_versions)),
              Effect.catchAll(() => Effect.succeed(null))
            )
          )
        : null;
    const schema = (tool.input_parameters ?? {}) as Record<string, unknown>;
    const version = resolveLatestAvailableVersion({
      toolLatestVersion: selectLatestVersion(tool.available_versions),
      toolkitLatestVersion,
    });
    toolDebugLog('resolved_tool_version', {
      slug,
      toolLatestVersion: selectLatestVersion(tool.available_versions),
      toolkitLatestVersion,
      resolvedVersion: version,
      cachePath: schemaPath,
    });
    yield* fs.writeFileString(
      schemaPath,
      serializeCachedToolDefinition({
        version,
        versionCheckedAt: new Date().toISOString(),
        inputSchema: schema,
      })
    );

    return { schemaPath, schema, version, versionCheckedAt: new Date().toISOString() };
  });

export const refreshToolInputDefinitionIfVersionChanged = (
  slug: string,
  cachedVersion: string | null,
  cachedVersionCheckedAt: string | null
) =>
  Effect.gen(function* () {
    const lastCheckedAtMs = cachedVersionCheckedAt ? Date.parse(cachedVersionCheckedAt) : NaN;
    const checkedRecently =
      Number.isFinite(lastCheckedAtMs) && Date.now() - lastCheckedAtMs < VERSION_CHECK_TTL_MS;
    if (checkedRecently) {
      return { isStale: false, latestVersion: cachedVersion, skipped: true as const };
    }

    const repo = yield* ComposioToolkitsRepository;
    const fs = yield* FileSystem.FileSystem;
    const cacheDir = yield* setupCacheDir;
    const schemaPath = toolDefinitionPath(cacheDir, slug);
    yield* ensureToolDefinitionsDir(fs, cacheDir);

    const tool = yield* repo.getToolDetailed(slug);
    toolDebugLog('tool_detail', {
      slug,
      tool,
      mode: 'refresh',
    });
    const toolkitLatestVersion =
      tool.toolkit.slug.length > 0
        ? (
            yield* repo.getToolkitDetailed(tool.toolkit.slug).pipe(
              Effect.tap(toolkit =>
                Effect.sync(() =>
                  toolDebugLog('toolkit_detail', {
                    slug,
                    toolkitSlug: tool.toolkit.slug,
                    toolkit,
                    mode: 'refresh',
                  })
                )
              ),
              Effect.map(toolkit => selectLatestVersion(toolkit.meta.available_versions)),
              Effect.catchAll(() => Effect.succeed(null))
            )
          )
        : null;
    const latestVersion = resolveLatestAvailableVersion({
      toolLatestVersion: selectLatestVersion(tool.available_versions),
      toolkitLatestVersion,
    });
    toolDebugLog('resolved_tool_version', {
      slug,
      mode: 'refresh',
      cachedVersion,
      toolLatestVersion: selectLatestVersion(tool.available_versions),
      toolkitLatestVersion,
      resolvedVersion: latestVersion,
    });
    const isStale = latestVersion !== cachedVersion;

    if (isStale) {
      const schema = (tool.input_parameters ?? {}) as Record<string, unknown>;
      yield* fs.writeFileString(
        schemaPath,
        serializeCachedToolDefinition({
          version: latestVersion,
          versionCheckedAt: new Date().toISOString(),
          inputSchema: schema,
        })
      );
    } else {
      const cached = yield* getCachedToolInputDefinition(slug);
      if (cached) {
        yield* fs.writeFileString(
          schemaPath,
          serializeCachedToolDefinition({
            version: cached.version,
            versionCheckedAt: new Date().toISOString(),
            inputSchema: cached.schema,
          })
        );
      }
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

    const zodSchema = yield* Effect.try({
      try: () => jsonSchemaToZodSchema<z.ZodTypeAny>(schema),
      catch: error =>
        new ToolInputValidationError(slug, schemaPath, [
          'Could not compile the cached JSON schema into a Zod validator.',
        ], { cause: error }),
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

export const validateToolInputArguments = (slug: string, args: Record<string, unknown>) =>
  Effect.gen(function* () {
    const definition = yield* getOrFetchToolInputDefinition(slug);
    return yield* validateToolInputArgumentsWithDefinition(slug, args, definition);
  });

export const warmToolInputDefinitions = (slugs: ReadonlyArray<string>) =>
  Effect.forEach([...new Set(slugs)].filter(Boolean), slug => getOrFetchToolInputDefinition(slug), {
    concurrency: 'unbounded',
    discard: true,
  });
