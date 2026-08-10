import { FileSystem, Path } from '@effect/platform';
import { BunFileSystem } from '@effect/platform-bun';
import { DateTime, Effect, Layer, Option, Schema } from 'effect';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { writeFileAtomic } from 'src/effects/write-file-atomic';
import { JSONTransformSchema } from 'src/models/utils/json-transform-schema';
import { NodeOs } from './node-os';

/**
 * Toolkit slugs this machine has learned since the CLI was built.
 *
 * The CLI ships with the catalog it knew at build time
 * (`src/generated/toolkit-slugs.ts`). Toolkits released after that are
 * discovered the first time someone runs one of their tools, and remembered
 * here so the next run costs nothing.
 *
 * This is derived data, not an HTTP response cache: it is read unconditionally
 * rather than under `FORCE_USE_CACHE`, which stays what it has always been —
 * an opt-in to replaying previously cached API responses. Being wrong about
 * this file can only cost a fetch, never an answer: an unknown slug falls
 * through to the catalog, and the backend never removes a toolkit, so a slug
 * recorded here never stops being real.
 */

export const KNOWN_TOOLKIT_SLUGS_FILE = 'known-toolkit-slugs.json';

const KnownToolkitSlugs = Schema.Struct({
  slugs: Schema.Array(Schema.String),
  refreshedAt: Schema.DateTimeUtc,
});

export type KnownToolkitSlugs = Schema.Schema.Type<typeof KnownToolkitSlugs>;

const KnownToolkitSlugsJSON = JSONTransformSchema(KnownToolkitSlugs);

/**
 * The file lives in the cache directory but is not part of the toolkit cache,
 * so it self-provides its platform services: callers stay free of filesystem
 * dependencies in their own environments.
 */
const provideFileSystem = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | NodeOs>
): Effect.Effect<A, E> =>
  effect.pipe(Effect.provide(Layer.mergeAll(BunFileSystem.layer, Path.layer, NodeOs.Default)));

const knownToolkitSlugsPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const cacheDir = yield* setupCacheDir;
  return path.join(cacheDir, KNOWN_TOOLKIT_SLUGS_FILE);
});

/**
 * Reads the learned slugs. A missing, unreadable, or corrupted file is not a
 * failure — it means "nothing learned yet", and the next refresh rewrites it.
 */
export const readKnownToolkitSlugs: Effect.Effect<Option.Option<KnownToolkitSlugs>> = Effect.gen(
  function* () {
    const fs = yield* FileSystem.FileSystem;
    const filePath = yield* knownToolkitSlugsPath;
    const content = yield* fs.readFileString(filePath);
    return yield* Schema.decode(KnownToolkitSlugsJSON)(content);
  }
).pipe(
  Effect.asSome,
  Effect.catchAll(error =>
    Effect.logDebug(`No usable ${KNOWN_TOOLKIT_SLUGS_FILE}: ${error}`).pipe(
      Effect.as(Option.none<KnownToolkitSlugs>())
    )
  ),
  provideFileSystem
);

/**
 * Records `slugs`, sorted and deduped, stamped with the current time.
 *
 * Never fails: this is an optimization, and a machine that cannot write to its
 * own cache directory should still be able to run tools. Concurrent CLI
 * processes are safe by construction — the write is atomic, and since slugs
 * are only ever added, whichever writer lands last leaves a usable file.
 */
export const writeKnownToolkitSlugs = (slugs: ReadonlyArray<string>): Effect.Effect<void> =>
  Effect.gen(function* () {
    const filePath = yield* knownToolkitSlugsPath;
    const refreshedAt = yield* DateTime.now;

    const content = yield* Schema.encode(KnownToolkitSlugsJSON)({
      slugs: [...new Set(slugs.map(slug => slug.toLowerCase()))].sort(),
      refreshedAt,
    });

    yield* writeFileAtomic(filePath, content);
    yield* Effect.logDebug(`Recorded ${slugs.length} toolkit slugs in ${filePath}`);
  }).pipe(
    Effect.catchAll(error => Effect.logDebug(`Failed to record known toolkit slugs: ${error}`)),
    provideFileSystem
  );
