#!/usr/bin/env bun

/**
 * Build all platform binaries via Bun cross-compilation.
 *
 * Usage: `bun scripts/build-all-binaries.ts`
 *
 * Builds every target in `RELEASE_TARGETS` sequentially.
 *
 * Output: `dist/binaries/composio-*`
 */

import { Config, ConfigProvider, Console, Effect, Logger, Layer, References } from 'effect';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { buildCompanionModules, compileBinary, teardown } from './_shared';
import { RELEASE_TARGETS } from './_release-artifacts';

export function buildAllBinaries() {
  return Effect.gen(function* () {
    yield* Console.log(`Building ${RELEASE_TARGETS.length} platform binaries...`);

    for (const target of RELEASE_TARGETS) {
      yield* Console.log(`\nBuilding ${target.artifact} (${target.bunTarget})...`);
      const outfile = yield* compileBinary(target);
      yield* Console.log(`Built: ${outfile}`);
    }

    const companionOutputDir = './dist/binaries/companions';
    yield* Console.log(`\nBuilding run companion modules in ${companionOutputDir}...`);
    yield* buildCompanionModules(companionOutputDir);

    yield* Console.log(`\nAll ${RELEASE_TARGETS.length} binaries built successfully.`);
  });
}

const ConfigLive = Effect.gen(function* () {
  const logLevel = yield* Config.LogLevel('COMPOSIO_LOG_LEVEL').pipe(Config.withDefault('Info'));

  return Layer.succeed(References.MinimumLogLevel, logLevel);
}).pipe(Layer.unwrap, Layer.merge(ConfigProvider.layer(ConfigProvider.fromEnv())));

if (require.main === module) {
  buildAllBinaries().pipe(
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
