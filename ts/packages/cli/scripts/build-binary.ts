import process from 'node:process';
import { Config, ConfigProvider, Effect, Logger, Layer, References } from 'effect';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import {
  buildCompanionModules,
  compileArgs,
  recordReleaseBytecodeOrder,
  runBunBuild,
  teardown,
} from './_shared';

/**
 * Usage: `bun scripts/build-binary.ts`
 */
export function buildBinary() {
  return Effect.gen(function* () {
    const cwd = process.cwd();
    yield* Effect.logDebug(`Building binary in ${cwd}`);

    const bytecodeOrder = yield* recordReleaseBytecodeOrder();
    yield* runBunBuild(compileArgs({ outfile: './dist/composio', bytecodeOrder }));

    yield* Effect.logDebug('', 'Binary built successfully');

    // Build companion modules that `composio run` imports in the child process.
    // These cannot live inside the compiled binary because they run in a separate
    // Bun process via the --preload globals file.
    yield* buildCompanionModules('./dist');

    yield* Effect.logDebug('', 'Companion modules built successfully');
  });
}

const ConfigLive = Effect.gen(function* () {
  const logLevel = yield* Config.LogLevel('COMPOSIO_LOG_LEVEL').pipe(Config.withDefault('Info'));

  return Layer.succeed(References.MinimumLogLevel, logLevel);
}).pipe(Layer.unwrap, Layer.merge(ConfigProvider.layer(ConfigProvider.fromEnv())));

if (require.main === module) {
  buildBinary().pipe(
    Effect.provide(ConfigLive),
    Effect.provide(Logger.layer([Logger.consolePretty()])),
    Effect.provide(BunServices.layer),
    Effect.scoped,
    Effect.map(() => ({ message: 'Process completed successfully.' })),
    BunRuntime.runMain({
      teardown,
    })
  );
}
