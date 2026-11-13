#!/usr/bin/env bun

/**
 * Cross-compile a CLI binary for a specific Bun target.
 *
 * Usage: `bun scripts/build-binary-cross.ts --target <target>`
 *
 * Valid targets are the `bunTarget` values of `RELEASE_TARGETS`.
 *
 * Output: `dist/binaries/<artifact-name>` (`.exe` on Windows)
 */

import process from 'node:process';
import { Config, ConfigProvider, Console, Effect, Logger, Layer, References } from 'effect';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { buildCompanionModules, compileBinary, teardown } from './_shared';
import { RELEASE_TARGETS, type ReleaseTarget } from './_release-artifacts';

function parseTarget(): ReleaseTarget {
  const targetIdx = process.argv.indexOf('--target');
  const requested = targetIdx === -1 ? undefined : process.argv[targetIdx + 1];
  const target = RELEASE_TARGETS.find(({ bunTarget }) => bunTarget === requested);
  if (!target) {
    process.stderr.write(
      requested
        ? `Invalid target: ${requested}\n`
        : `Usage: bun scripts/build-binary-cross.ts --target <target>\n`
    );
    process.stderr.write(
      `Valid targets: ${RELEASE_TARGETS.map(({ bunTarget }) => bunTarget).join(', ')}\n`
    );
    process.exit(1);
  }
  return target;
}

export function buildBinaryCross() {
  const target = parseTarget();

  return Effect.gen(function* () {
    yield* Effect.logDebug(
      `Cross-compiling binary in ${process.cwd()} for target ${target.bunTarget}`
    );

    const outfile = yield* compileBinary(target);

    yield* buildCompanionModules('./dist/binaries/companions');

    yield* Console.log(`Binary cross-compiled: ${outfile}`);
  });
}

const ConfigLive = Effect.gen(function* () {
  const logLevel = yield* Config.LogLevel('COMPOSIO_LOG_LEVEL').pipe(Config.withDefault('Info'));

  return Layer.succeed(References.MinimumLogLevel, logLevel);
}).pipe(Layer.unwrap, Layer.merge(ConfigProvider.layer(ConfigProvider.fromEnv())));

if (require.main === module) {
  buildBinaryCross().pipe(
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
