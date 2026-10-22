#!/usr/bin/env bun

/**
 * Build the `composio run` companion modules next to an already-compiled binary.
 *
 * `scripts/build-binary.ts` does this as part of a full release build. This
 * entry point exists for builds that compile the binary themselves, such as the
 * CLI e2e image.
 *
 * Usage: `bun scripts/build-companion-modules.ts <OUTPUT_DIR>`
 */

import process from 'node:process';
import { Config, ConfigProvider, Console, Effect, Logger, Layer, References } from 'effect';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { buildCompanionModules, teardown } from './_shared';
import { BinaryBuildError } from './build-error';

export function buildCompanionModulesCommand() {
  return Effect.gen(function* () {
    const outputDir = process.argv[2];

    if (!outputDir) {
      return yield* new BinaryBuildError({
        message: 'Missing <OUTPUT_DIR> argument',
        exitCode: 1,
      });
    }

    yield* buildCompanionModules(outputDir);

    yield* Console.log(`Companion modules built in ${outputDir}`);
  });
}

const ConfigLive = Effect.gen(function* () {
  const logLevel = yield* Config.LogLevel('COMPOSIO_LOG_LEVEL').pipe(Config.withDefault('Info'));

  return Layer.succeed(References.MinimumLogLevel, logLevel);
}).pipe(Layer.unwrap, Layer.merge(ConfigProvider.layer(ConfigProvider.fromEnv())));

if (require.main === module) {
  buildCompanionModulesCommand().pipe(
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
