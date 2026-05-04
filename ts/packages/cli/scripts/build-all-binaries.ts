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

import process from 'node:process';
import { Config, ConfigProvider, Console, Effect, Stream, Logger, Layer, LogLevel } from 'effect';
import { Command } from '@effect/platform';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import { buildCompanionModules, teardown } from './_shared';

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

    const cmd = Command.make(...args);

    const { exitCode } = yield* cmd.pipe(
      Command.start,
      Effect.flatMap(process =>
        Effect.all(
          {
            exitCode: process.exitCode,
            output: Stream.merge(
              Stream.decodeText(process.stdout, 'utf-8'),
              Stream.decodeText(process.stderr, 'utf-8'),
              { haltStrategy: 'left' }
            ).pipe(
              Stream.tap(chunk => Console.log(chunk)),
              Stream.runDrain
            ),
          },
          {
            concurrency: 'unbounded',
          }
        )
      )
    );

    if (exitCode !== 0) {
      return yield* Effect.fail(new Error(`Failed to build binary for ${target}`));
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

    yield* Console.log(`\nAll ${TARGETS.length} binaries built successfully.`);
  });
}

const ConfigLive = Effect.gen(function* () {
  const logLevel = yield* Config.logLevel('COMPOSIO_LOG_LEVEL').pipe(
    Config.withDefault(LogLevel.Info)
  );

  return Logger.minimumLogLevel(logLevel);
}).pipe(Layer.unwrapEffect, Layer.merge(Layer.setConfigProvider(ConfigProvider.fromEnv())));

if (require.main === module) {
  buildAllBinaries().pipe(
    Effect.provide(ConfigLive),
    Effect.provide(Logger.pretty),
    Effect.provide(BunContext.layer),
    Effect.scoped,
    Effect.map(() => ({ message: 'Process completed successfully.' })),
    BunRuntime.runMain({
      teardown,
    })
  );
}
