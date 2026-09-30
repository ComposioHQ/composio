import { describe, expect, it, vi } from '@effect/vitest';
import { ConfigProvider, DateTime, Effect, Layer } from 'effect';
import * as tempy from 'tempy';
import {
  ComposioToolkitsRepository,
  HttpServerError,
  type ToolkitProjectScope,
} from 'src/services/composio-clients';
import * as FileSystem from 'effect/FileSystem';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import {
  CACHE_FILES,
  ComposioToolkitsRepositoryCached,
} from 'src/services/composio-clients-cached';
import { toolkitsToJSON, type Toolkits } from 'src/models/toolkits';
import { makeToolkitFixture } from 'test/__utils__/models/toolkits';
import {
  countingToolkitsRepository,
  makeToolkitsRepositoryStub,
  type GetProjectToolkitsError,
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
    readonly projectCalls: () => number;
    readonly cacheDir: string;
  }) => Effect.Effect<
    A,
    GetToolkitsError | GetProjectToolkitsError,
    ComposioToolkitsRepository | FileSystem.FileSystem
  >,
  config: ReadonlyArray<readonly [string, string]> = [],
  getProjectToolkits?: (
    scope?: ToolkitProjectScope
  ) => Effect.Effect<Toolkits, GetProjectToolkitsError>
) =>
  Effect.suspend(() => {
    const cacheDir = tempy.temporaryDirectory();
    const repository = countingToolkitsRepository(getToolkits, getProjectToolkits);

    return program({
      calls: repository.calls,
      projectCalls: repository.projectCalls,
      cacheDir,
    }).pipe(
      Effect.provide(
        Layer.merge(
          Layer.provide(ComposioToolkitsRepositoryCached, repository.layer),
          BunFileSystem.layer
        )
      ),
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromEnvRecord(Object.fromEntries([['CACHE_DIR', cacheDir], ...config]))
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

          const first = yield* Effect.result(repository.getToolkits());
          const second = yield* Effect.result(repository.getToolkits());

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

  it.effect('fetches project toolkits once, and never from the cached file', () =>
    withCountingRepository(
      () => Effect.die('the cached file should have answered this'),
      ({ calls, projectCalls, cacheDir }) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const cacheFile = `${cacheDir}/${CACHE_FILES.toolkits}`;
          const cached = yield* toolkitsToJSON(testToolkits).pipe(Effect.orDie);
          yield* fs.writeFileString(cacheFile, cached).pipe(Effect.orDie);

          const repository = yield* ComposioToolkitsRepository;
          const toolkits = yield* repository.getToolkits();
          const projectToolkits = yield* repository.getProjectToolkits();
          yield* repository.getProjectToolkits();

          expect(toolkits.map(t => t.slug)).toEqual(['github', 'gmail']);
          expect(projectToolkits.map(t => t.slug)).toEqual(['custom_grain']);
          expect(calls()).toBe(0);
          expect(projectCalls()).toBe(1);
          // `toolkits.json` holds the Composio-managed catalog only.
          expect(yield* fs.readFileString(cacheFile).pipe(Effect.orDie)).toBe(cached);
        }),
      [['FORCE_USE_CACHE', 'true']],
      () => Effect.succeed([makeToolkitFixture('custom_grain')])
    )
  );

  it.effect('surfaces a failed project fetch once, and does not retry it', () =>
    withCountingRepository(
      () => Effect.die('the project lookup should not read the catalog'),
      ({ projectCalls }) =>
        Effect.gen(function* () {
          const repository = yield* ComposioToolkitsRepository;
          const scope = { orgId: 'org_a', projectId: 'pr_a' };

          const first = yield* Effect.result(repository.getProjectToolkits(scope));
          const second = yield* Effect.result(repository.getProjectToolkits(scope));

          expect(second).toEqual(first);
          expect(projectCalls()).toBe(1);
        }),
      [],
      () => Effect.fail(new HttpServerError({ cause: 'network down', status: 503 }))
    )
  );

  it.effect('fetches project toolkits once per project scope', () =>
    withCountingRepository(
      () => Effect.die('the project lookup should not read the catalog'),
      ({ projectCalls }) =>
        Effect.gen(function* () {
          const repository = yield* ComposioToolkitsRepository;
          const scopeA = { orgId: 'org_a', projectId: 'pr_a' };
          const scopeB = { orgId: 'org_a', projectId: 'pr_b' };

          const results = yield* Effect.all([
            repository.getProjectToolkits(scopeA),
            repository.getProjectToolkits(scopeB),
            repository.getProjectToolkits({ ...scopeA }),
            repository.getProjectToolkits(scopeB),
            repository.getProjectToolkits(),
          ]);

          expect(results.map(toolkits => toolkits.map(t => t.slug))).toEqual([
            ['custom_pr_a'],
            ['custom_pr_b'],
            ['custom_pr_a'],
            ['custom_pr_b'],
            ['custom_unscoped'],
          ]);
          // Unscoped is a scope of its own: the project context decides it.
          expect(projectCalls()).toBe(3);
        }),
      [],
      scope => Effect.succeed([makeToolkitFixture(`custom_${scope?.projectId ?? 'unscoped'}`)])
    )
  );

  it.effect('passes an uncached method straight through to the underlying repository', () =>
    Effect.gen(function* () {
      const searchTools = vi.fn(() =>
        Effect.succeed({
          items: [],
          total_items: 0,
          total_pages: 0,
          current_page: 1,
          next_cursor: null,
        })
      );
      const underlying = makeToolkitsRepositoryStub({ searchTools });
      const params = { search: 'gmail', limit: 3 };

      const repository = yield* ComposioToolkitsRepository.pipe(
        Effect.provide(
          Layer.provide(
            ComposioToolkitsRepositoryCached,
            Layer.succeed(ComposioToolkitsRepository, underlying)
          )
        )
      );
      yield* repository.searchTools(params);

      expect(searchTools).toHaveBeenCalledOnce();
      expect(searchTools).toHaveBeenCalledWith(params);
    })
  );

  it.effect('exposes an underlying method it does not know about', () =>
    Effect.gen(function* () {
      const addedLater = () => Effect.succeed('added later');
      const underlying = Object.assign(makeToolkitsRepositoryStub({}), { addedLater });

      const repository = yield* ComposioToolkitsRepository.pipe(
        Effect.provide(
          Layer.provide(
            ComposioToolkitsRepositoryCached,
            Layer.succeed(ComposioToolkitsRepository, underlying)
          )
        )
      );

      expect((repository as typeof underlying).addedLater).toBe(addedLater);
    })
  );
});
