import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, DateTime, Effect, Layer } from 'effect';
import * as tempy from 'tempy';
import { ComposioToolkitsRepository, HttpServerError } from 'src/services/composio-clients';
import { FileSystem } from '@effect/platform';
import { BunFileSystem } from '@effect/platform-bun';
import {
  CACHE_FILES,
  ComposioToolkitsRepositoryCached,
} from 'src/services/composio-clients-cached';
import { toolkitsToJSON, type Toolkits } from 'src/models/toolkits';
import { makeToolkitFixture } from 'test/__utils__/models/toolkits';
import {
  countingToolkitsRepository,
  type GetToolkitsError,
} from 'test/__utils__/services/toolkits-repository-stub';

const testToolkits: Toolkits = [makeToolkitFixture('github'), makeToolkitFixture('gmail')];

/**
 * Cached repository over a counting stub, with the cache directory pointed at a
 * fresh temp dir so nothing leaks between tests or into the developer's
 * `~/.composio`. `FORCE_USE_CACHE` stays unset unless a test passes it in, i.e.
 * the file cache is write-only — the default path this suite is about.
 */
const withCountingRepository = <A>(
  getToolkits: () => Effect.Effect<Toolkits, GetToolkitsError>,
  program: (context: {
    readonly calls: () => number;
    readonly cacheDir: string;
  }) => Effect.Effect<A, GetToolkitsError, ComposioToolkitsRepository | FileSystem.FileSystem>,
  config: ReadonlyArray<readonly [string, string]> = []
) =>
  Effect.suspend(() => {
    const cacheDir = tempy.temporaryDirectory();
    const repository = countingToolkitsRepository(getToolkits);

    return program({ calls: repository.calls, cacheDir }).pipe(
      Effect.provide(
        Layer.merge(
          Layer.provide(ComposioToolkitsRepositoryCached, repository.layer),
          BunFileSystem.layer
        )
      ),
      Effect.withConfigProvider(
        ConfigProvider.fromMap(new Map([['CACHE_DIR', cacheDir], ...config]))
      )
    );
  });

describe('ComposioToolkitsRepositoryCached', () => {
  it.effect('fetches the toolkit list once per layer, however many callers ask for it', () =>
    withCountingRepository(
      () => Effect.succeed(testToolkits),
      ({ calls }) =>
        Effect.gen(function* () {
          const repository = yield* ComposioToolkitsRepository;

          const results = yield* Effect.all([
            repository.getToolkits(),
            repository.getToolkits(),
            repository.getToolkits(),
          ]);

          expect(results.map(toolkits => toolkits.map(t => t.slug))).toEqual([
            ['github', 'gmail'],
            ['github', 'gmail'],
            ['github', 'gmail'],
          ]);
          expect(calls()).toBe(1);
        })
    )
  );

  // `it.live`: the stubbed fetch takes real time, so the callers genuinely overlap.
  it.live('fetches once even when concurrent callers ask at the same time', () =>
    withCountingRepository(
      () => Effect.succeed(testToolkits).pipe(Effect.delay('10 millis')),
      ({ calls }) =>
        Effect.gen(function* () {
          const repository = yield* ComposioToolkitsRepository;

          yield* Effect.all(
            [repository.getToolkits(), repository.getToolkits(), repository.getToolkits()],
            { concurrency: 'unbounded' }
          );

          expect(calls()).toBe(1);
        })
    )
  );

  it.effect('surfaces a failed fetch once, and does not retry it', () =>
    withCountingRepository(
      () => Effect.fail(new HttpServerError({ cause: 'network down', status: 503 })),
      ({ calls }) =>
        Effect.gen(function* () {
          const repository = yield* ComposioToolkitsRepository;

          const first = yield* Effect.either(repository.getToolkits());
          const second = yield* Effect.either(repository.getToolkits());

          expect(second).toEqual(first);
          // One attempt for both callers: the caching layer must not mistake
          // the fetch's own failure for a cache failure worth retrying.
          expect(calls()).toBe(1);
        })
    )
  );

  it.effect('serves the cached file when FORCE_USE_CACHE is on, without fetching', () =>
    withCountingRepository(
      () => Effect.die('the cached file should have answered this'),
      ({ calls, cacheDir }) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs
            .writeFileString(
              `${cacheDir}/${CACHE_FILES.toolkits}`,
              yield* toolkitsToJSON(testToolkits).pipe(Effect.orDie)
            )
            .pipe(Effect.orDie);

          const repository = yield* ComposioToolkitsRepository;
          const toolkits = yield* repository.getToolkits();

          expect(toolkits.map(t => t.slug)).toEqual(['github', 'gmail']);
          expect(calls()).toBe(0);
        }),
      [['FORCE_USE_CACHE', 'true']]
    )
  );
});
