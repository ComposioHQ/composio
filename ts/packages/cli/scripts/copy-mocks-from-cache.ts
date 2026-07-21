import process from 'node:process';
import { Config, ConfigProvider, Console, Effect, Logger, Layer, References } from 'effect';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { FileSystem } from 'effect/FileSystem';
import { teardown } from './_shared';
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
    const fs = yield* FileSystem;
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
        .pipe(Effect.orElseSucceed(() => false));

      if (!cacheFileExists) {
        yield* Effect.logWarning(`Cache file ${cacheFilePath} does not exist, skipping.`);
        continue;
      }

      yield* Effect.tryPromise(() => $`cp ${cacheFilePath} ${mocksFilePath}`.quiet());
    }

    yield* Console.log('Cached responses successfully copied into mocks folder:', mocksDir);
  });
}

const ConfigLive = Effect.gen(function* () {
  const logLevel = yield* Config.logLevel('COMPOSIO_LOG_LEVEL').pipe(Config.withDefault('Info'));

  return Layer.succeed(References.MinimumLogLevel, logLevel);
}).pipe(Layer.unwrap, Layer.merge(ConfigProvider.layer(ConfigProvider.fromEnv())));

if (require.main === module) {
  copyMocksFromCache().pipe(
    Effect.provide(ConfigLive),
    Effect.provide(Logger.layer([Logger.consolePretty()])),
    Effect.provide(BunServices.layer),
    Effect.provide(NodeOs.Default),
    Effect.scoped,
    Effect.map(() => ({ message: 'Process completed successfully.' })),
    BunRuntime.runMain({
      teardown,
    })
  );
}
