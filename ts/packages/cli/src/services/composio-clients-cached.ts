import path from 'node:path';
import { Effect, Option, ParseResult, Layer } from 'effect';
import { FileSystem } from '@effect/platform';
import { BunFileSystem } from '@effect/platform-bun';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { FORCE_CONFIG } from 'src/effects/force-config';
import { ComposioToolkitsRepository } from './composio-clients';
import { NodeOs } from './node-os';
import { toolkitsFromJSON, toolkitsToJSON } from 'src/models/toolkits';
import { toolsFromJSON, toolsToJSON } from 'src/models/tools';
import {
  TriggerTypesAsEnumsFromJSON,
  TriggerTypesAsEnumsToJSON,
  TriggerTypesFromJSON,
  TriggerTypesToJSON,
} from 'src/models/trigger-types';
import { ConfigLive } from './config';

/**
 * Cache file names for different data types
 */
export const CACHE_FILES = {
  toolkits: 'toolkits.json',
  tools: 'tools.json',
  triggerTypesAsEnums: 'trigger-types-as-enums.json',
  triggerTypes: 'trigger-types.json',
} as const;

/**
 * Generic cache helper function that handles both cache read/write with graceful error handling.
 */
function createCachedEffect<T, E, R>(
  cacheFileName: string,
  decoder: (input: string) => Effect.Effect<T, ParseResult.ParseError>,
  encoder: (input: T) => Effect.Effect<string, ParseResult.ParseError>,
  computation: Effect.Effect<T, E, R>
): Effect.Effect<T, E, R> {
  // First define the cache-handling function that will run with all required services
  const cacheEffect = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const cacheDir = yield* setupCacheDir;

    const cacheFilePath = path.join(cacheDir, cacheFileName);
    const cacheFileExists = yield* fs
      .exists(cacheFilePath)
      .pipe(Effect.orElse(() => Effect.succeed(false)));
    const consumeFromCache = yield* FORCE_CONFIG['USE_CACHE'];

    if (consumeFromCache && cacheFileExists) {
      yield* Effect.logDebug(`Cache HIT for ${cacheFileName}`);

      // Try to read from cache
      const cachedResult = yield* fs.readFileString(cacheFilePath).pipe(
        Effect.flatMap(decoder),
        Effect.asSome,
        Effect.catchAll(error => {
          // Log cache read/parse errors but don't fail - fall through to computation
          return Effect.logWarning(`Failed to read/parse cache ${cacheFilePath}: ${error}`).pipe(
            Effect.as(Option.none<T>())
          );
        })
      );

      if (Option.isSome(cachedResult)) {
        return cachedResult.value;
      }
    }

    yield* Effect.logDebug(`Cache MISS for ${cacheFileName}`);

    // Fetch from the underlying service
    const result = yield* computation;

    // Write to cache (best effort: don't fail if cache write fails)
    yield* encoder(result).pipe(
      Effect.flatMap(content => fs.writeFileString(cacheFilePath, content)),
      Effect.catchAll(error =>
        Effect.logWarning(`Failed to write to cache ${cacheFilePath}: ${error}`)
      )
    );

    return result;
  });

  // Handle any cache errors by falling back to the original computation
  const handledCacheEffect = cacheEffect.pipe(
    Effect.catchAll(error =>
      Effect.logWarning(`Cache operation failed: ${error}`).pipe(Effect.flatMap(() => computation))
    )
  );

  // This ensures the returned effect has the same error type as the original computation
  // by providing all the required cache services
  return handledCacheEffect.pipe(
    Effect.provide(Layer.mergeAll(BunFileSystem.layer, NodeOs.Default))
  ) as Effect.Effect<T, E, R>;
}

/**
 * Cached implementation of ComposioToolkitsRepository using the wrapper layer pattern
 *
 * This layer adds file-based caching to the repository methods while preserving the
 * exact same interface and error types.
 */
export const ComposioToolkitsRepositoryCached = Layer.effect(
  ComposioToolkitsRepository,
  Effect.gen(function* () {
    const underlyingRepository = yield* ComposioToolkitsRepository;

    // Create the cached implementation that wraps the original implementation
    return ComposioToolkitsRepository.make({
      getToolkits: () => {
        return createCachedEffect(
          CACHE_FILES.toolkits,
          toolkitsFromJSON,
          toolkitsToJSON,
          underlyingRepository.getToolkits()
        );
      },

      getTools: () => {
        return createCachedEffect(
          CACHE_FILES.tools,
          toolsFromJSON,
          toolsToJSON,
          underlyingRepository.getTools()
        );
      },

      getTriggerTypesAsEnums: () => {
        return createCachedEffect(
          CACHE_FILES.triggerTypesAsEnums,
          TriggerTypesAsEnumsFromJSON,
          TriggerTypesAsEnumsToJSON,
          underlyingRepository.getTriggerTypesAsEnums()
        );
      },

      getTriggerTypes: (limit: number) => {
        return createCachedEffect(
          // We don't care about the limit in the cache file name
          CACHE_FILES.triggerTypes,
          TriggerTypesFromJSON,
          TriggerTypesToJSON,
          underlyingRepository.getTriggerTypes(limit)
        );
      },
    });
  })
).pipe(
  // Provide the required dependencies for the layer
  Layer.provide(Layer.mergeAll(BunFileSystem.layer, NodeOs.Default, ConfigLive))
);
