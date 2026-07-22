#!/usr/bin/env bun

/**
 * Build all platform binaries via Bun cross-compilation.
 *
 * Usage: `bun scripts/build-all-binaries.ts`
 *
 * Builds all 4 targets sequentially:
 *   composio-darwin-aarch64, composio-darwin-x64,
 *   composio-linux-x64, composio-linux-aarch64
 *
 * Output: `dist/binaries/composio-*`
 */

import { Config, ConfigProvider, Console, Effect, Stream, Logger, Layer, References } from 'effect';
import { ChildProcess as Command } from 'effect/unstable/process';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { buildCompanionModules, copyLocalToolBinaryAssets, teardown } from './_shared';
import { BinaryBuildError } from './build-error';

/**
 * All cross-compilation targets and their artifact names.
 */
const TARGETS = [
  { target: 'bun-darwin-arm64', artifact: 'composio-darwin-aarch64' },
  { target: 'bun-darwin-x64', artifact: 'composio-darwin-x64' },
  { target: 'bun-linux-x64', artifact: 'composio-linux-x64' },
  { target: 'bun-linux-arm64', artifact: 'composio-linux-aarch64' },
] as const;

function runBunBuild(target: string, outfile: string) {
  return Effect.gen(function* () {
    const args = [
      'bun',
      'build',
      './src/bin.ts',
      '--env',
      'DEBUG_OVERRIDE_*',
      '--compile',
      '--production',
      '--target',
      target,
      '--outfile',
      outfile,
    ] as const satisfies ReadonlyArray<string>;

    const child = yield* Command.make(args[0], args.slice(1));

    const { exitCode } = yield* Effect.all(
      {
        exitCode: child.exitCode,
        output: Stream.merge(
          Stream.decodeText(child.stdout, { encoding: 'utf-8' }),
          Stream.decodeText(child.stderr, { encoding: 'utf-8' }),
          { haltStrategy: 'left' }
        ).pipe(
          Stream.tap(chunk => Console.log(chunk)),
          Stream.runDrain
        ),
      },
      {
        concurrency: 'unbounded',
      }
    );

    if (exitCode !== 0) {
      return yield* new BinaryBuildError({
        message: `Failed to build binary for ${target}`,
        target,
        exitCode,
      });
    }
  });
}

export function buildAllBinaries() {
  return Effect.gen(function* () {
    yield* Console.log(`Building ${TARGETS.length} platform binaries...`);

    for (const { target, artifact } of TARGETS) {
      const outfile = `./dist/binaries/${artifact}`;
      yield* Console.log(`\nBuilding ${artifact} (${target})...`);
      yield* runBunBuild(target, outfile);
      yield* Console.log(`Built: ${outfile}`);
    }

    const companionOutputDir = './dist/binaries/companions';
    yield* Console.log(`\nBuilding run companion modules in ${companionOutputDir}...`);
    yield* buildCompanionModules(companionOutputDir);

    yield* copyLocalToolBinaryAssets('./dist/binaries');

    yield* Console.log(`\nAll ${TARGETS.length} binaries built successfully.`);
  });
}

const ConfigLive = Effect.gen(function* () {
  const logLevel = yield* Config.logLevel('COMPOSIO_LOG_LEVEL').pipe(Config.withDefault('Info'));

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
