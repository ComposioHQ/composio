import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { Config, ConfigProvider, Effect, Logger, Layer, References } from 'effect';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { buildCompanionModules, compileExecutable, teardown } from './_shared';

/**
 * Build the CLI executable for the host, with its companion modules next to it.
 *
 * Usage: `bun scripts/build-binary.ts [--outdir <dir>]`
 *
 * Writes `<dir>/composio` and the companion modules into `<dir>` (default `./dist`).
 * The e2e Docker images build through this script, so they test the release flags.
 */
const parseOutdir = (): string =>
  parseArgs({ options: { outdir: { type: 'string', default: './dist' } } }).values.outdir;

export function buildBinary(outdir = parseOutdir()) {
  return Effect.gen(function* () {
    yield* Effect.logDebug(`Building binary in ${process.cwd()} into ${outdir}`);

    yield* compileExecutable(path.join(outdir, 'composio'));

    yield* Effect.logDebug('', 'Binary built successfully');

    // The retired companion paths, which release archives still carry (see
    // `RUN_COMPANION_MODULE_BASENAMES`).
    yield* buildCompanionModules(outdir);

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
