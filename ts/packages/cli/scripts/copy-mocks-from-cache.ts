import process from 'node:process';
import {
  Cause,
  Config,
  ConfigProvider,
  Console,
  Effect,
  Exit,
  Logger,
  Layer,
  LogLevel,
} from 'effect';
import { BunContext, BunFileSystem, BunRuntime } from '@effect/platform-bun';
import { FileSystem } from '@effect/platform';
import type { Teardown } from '@effect/platform/Runtime';
import path from 'node:path';
import { $ } from 'bun';
import { CACHE_FILES } from '../src/services/composio-clients-cached';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { NodeOs } from 'src/services/node-os';

/**
 * Usage: `bun scripts/copy-mocks-from-cache.ts`.
 *
 * Copies cached mock responses from the cache directory to the specified mocks directory.
 */
export function copyMocksFromCache() {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const defaultMocksDir = path.join(process.cwd(), 'test', '__mocks__');

    const cacheDir = yield* setupCacheDir;

    const mocksDir = yield* Config.string('COMPOSIO_MOCKS_DIR').pipe(
      Config.withDefault(defaultMocksDir)
    );

    yield* Effect.logDebug(`Copying mocks to ${mocksDir}`);

    for (const [key, cacheFileName] of Object.entries(CACHE_FILES)) {
      const cacheFilePath = path.join(cacheDir, cacheFileName);
      const mocksFilePath = path.join(mocksDir, cacheFileName);

      yield* Effect.logDebug(`Copying ${key} from ${cacheFilePath}`);

      const cacheFileExists = yield* fs
        .exists(cacheFilePath)
        .pipe(Effect.orElse(() => Effect.succeed(false)));

      if (!cacheFileExists) {
        yield* Effect.logWarning(`Cache file ${cacheFilePath} does not exist, skipping.`);
        continue;
      }

      yield* Effect.tryPromise(() => $`cp ${cacheFilePath} ${mocksFilePath}`.quiet());
    }

    yield* Console.log('Cached responses successfully copied into mocks folder:', mocksDir);
  });
}

export const teardown: Teardown = <E, A>(exit: Exit.Exit<E, A>, onExit: (code: number) => void) => {
  const shouldFail = Exit.isFailure(exit) && !Cause.isInterruptedOnly(exit.cause);
  const errorCode = Number(process.exitCode ?? 1);
  onExit(shouldFail ? errorCode : 0);
};

const ConfigLive = Effect.gen(function* () {
  const logLevel = yield* Config.logLevel('COMPOSIO_LOG_LEVEL').pipe(
    Config.withDefault(LogLevel.Info)
  );

  return Logger.minimumLogLevel(logLevel);
}).pipe(Layer.unwrapEffect, Layer.merge(Layer.setConfigProvider(ConfigProvider.fromEnv())));

if (require.main === module) {
  copyMocksFromCache().pipe(
    Effect.provide(ConfigLive),
    Effect.provide(Logger.pretty),
    Effect.provide(BunContext.layer),
    Effect.provide(BunFileSystem.layer),
    Effect.provide(NodeOs.Default),
    Effect.scoped,
    Effect.map(() => ({ message: 'Process completed successfully.' })),
    BunRuntime.runMain({
      teardown,
    })
  );
}
