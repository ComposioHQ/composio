#!/usr/bin/env bun

/**
 * Build the `composio run` companion modules next to an already-compiled binary.
 *
 * `scripts/build-binary.ts` does this as part of a full release build, shipping
 * every platform's codex-acp binary. This entry point exists for builds whose
 * output only ever runs on the building machine — the CLI e2e image — where
 * downloading three foreign codex-acp binaries costs ~600MB and minutes of build
 * time for files that machine can never execute.
 *
 * Usage: `bun scripts/build-companion-modules.ts <OUTPUT_DIR> [--host-only]`
 */

import process from 'node:process';
import { Config, ConfigProvider, Console, Effect, Logger, Layer, LogLevel } from 'effect';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import { buildCompanionModules, hostCodexAcpBinaryTargets, teardown } from './_shared';
import { BinaryBuildError } from './build-error';

export function buildCompanionModulesCommand() {
  return Effect.gen(function* () {
    const args = process.argv.slice(2);
    const outputDir = args.find(arg => !arg.startsWith('--'));

    if (!outputDir) {
      return yield* new BinaryBuildError({
        message: 'Missing <OUTPUT_DIR> argument',
        exitCode: 1,
      });
    }

    const hostOnly = args.includes('--host-only');
    const codexBinaryTargets = hostOnly ? hostCodexAcpBinaryTargets() : undefined;

    yield* buildCompanionModules(outputDir, { codexBinaryTargets });

    yield* Console.log(
      `Companion modules built in ${outputDir}${
        hostOnly
          ? ` (codex-acp: ${codexBinaryTargets?.map(target => target.relativePath).join(', ') || 'none for this host'})`
          : ''
      }`
    );
  });
}

const ConfigLive = Effect.gen(function* () {
  const logLevel = yield* Config.logLevel('COMPOSIO_LOG_LEVEL').pipe(
    Config.withDefault(LogLevel.Info)
  );

  return Logger.minimumLogLevel(logLevel);
}).pipe(Layer.unwrapEffect, Layer.merge(Layer.setConfigProvider(ConfigProvider.fromEnv())));

if (require.main === module) {
  buildCompanionModulesCommand().pipe(
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
