import { Duration, Effect, Fiber, FileSystem, Layer, Path } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { TestClock } from 'effect/testing';
import { GitHub } from '../scripts/sdk-release/github';
import { ReleaseServices, readFile } from '../scripts/sdk-release/runtime';

export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

// Retries back off for a millisecond, so a test of a failing request does not wait seconds.
const TestServices = Layer.provideMerge(GitHub.layer('token', { baseDelayMs: 1 }), ReleaseServices);
type TestServices = Layer.Success<typeof TestServices>;

/** Runs a release effect with Bun platform services, a test GitHub token, and an optional fake fetch. */
export const runRelease = <A, E>(
  effect: Effect.Effect<A, E, TestServices>,
  fetch?: Fetch
): Promise<A> => {
  const withFetch = fetch
    ? effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch as typeof globalThis.fetch))
    : effect;
  return Effect.runPromise(withFetch.pipe(Effect.provide(TestServices)));
};

/** One real macrotask, so the fake fetch's promises settle between test-clock steps. */
const settle = Effect.promise(() => new Promise<void>(resolve => setTimeout(resolve, 0)));

/**
 * Runs a release effect on a test clock that moves `step` at a time until the effect ends, so a
 * registry wait of many minutes takes milliseconds. `fetch` reads the test clock through `now`, for
 * a registry that starts serving something at a given minute.
 */
export const runOnTestClock = <A, E>(
  effect: Effect.Effect<A, E, TestServices>,
  fetch: (now: () => number) => Fetch,
  options: { readonly step?: Duration.Input; readonly limit?: Duration.Input } = {}
): Promise<A> =>
  runRelease(
    Effect.gen(function* () {
      const clock = yield* TestClock.testClockWith(Effect.succeed);
      const now = () => clock.currentTimeMillisUnsafe();
      const fiber = yield* Effect.forkChild(
        effect.pipe(
          Effect.provideService(FetchHttpClient.Fetch, fetch(now) as typeof globalThis.fetch)
        )
      );
      const limit = Duration.toMillis(options.limit ?? '1 hour');
      while (fiber.pollUnsafe() === undefined && now() < limit) {
        yield* TestClock.adjust(options.step ?? '5 seconds');
        yield* settle;
      }
      if (fiber.pollUnsafe() === undefined) {
        yield* Fiber.interrupt(fiber);
        return yield* Effect.die(new Error(`Still running after ${limit / 60_000} test minutes`));
      }
      return yield* Fiber.join(fiber);
    }).pipe(Effect.provide(TestClock.layer()))
  );

export const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Temporary directories created by a suite; call `cleanup` from `afterEach`. */
export const temporaryDirectories = (prefix: string) => {
  const created: string[] = [];
  return {
    create: () =>
      runRelease(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const directory = yield* fs.makeTempDirectory({ prefix });
          created.push(directory);
          return directory;
        })
      ),
    cleanup: () =>
      runRelease(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* Effect.forEach(created.splice(0), directory =>
            fs.remove(directory, { recursive: true, force: true })
          );
        })
      ),
  };
};

export const writeText = (file: string, contents: string) =>
  runRelease(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFileString(file, contents);
    })
  );

export const readText = (file: string) => runRelease(readFile(file));

const withFileSystem = <A, E>(use: (fs: FileSystem.FileSystem) => Effect.Effect<A, E>) =>
  runRelease(
    Effect.gen(function* () {
      return yield* use(yield* FileSystem.FileSystem);
    })
  );

export const exists = (file: string) => withFileSystem(fs => fs.exists(file));
export const remove = (file: string) => withFileSystem(fs => fs.remove(file));
export const symlink = (target: string, link: string) =>
  withFileSystem(fs => fs.symlink(target, link));
export const makeExecutable = (file: string) => withFileSystem(fs => fs.chmod(file, 0o755));

export const resolvePath = (...segments: string[]) =>
  runRelease(
    Effect.gen(function* () {
      return (yield* Path.Path).resolve(...segments);
    })
  );
