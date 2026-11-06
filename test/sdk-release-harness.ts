import { Effect, FileSystem, Layer, Path } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { ReleaseServices, readFile } from '../scripts/sdk-release/runtime';

export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const TestServices = ReleaseServices;
type TestServices = Layer.Success<typeof TestServices>;

/** Runs a release effect with Bun platform services and an optional fake fetch. */
export const runRelease = <A, E>(
  effect: Effect.Effect<A, E, TestServices>,
  fetch?: Fetch
): Promise<A> => {
  const withFetch = fetch
    ? effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch as typeof globalThis.fetch))
    : effect;
  return Effect.runPromise(withFetch.pipe(Effect.provide(TestServices)));
};

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
