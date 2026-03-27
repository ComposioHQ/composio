#!/usr/bin/env bun

/**
 * Cross-compile a CLI binary for a specific Bun target.
 *
 * Usage: `bun scripts/build-binary-cross.ts --target <target>`
 *
 * Valid targets:
 *   bun-darwin-arm64  → composio-darwin-aarch64
 *   bun-darwin-x64    → composio-darwin-x64
 *   bun-linux-x64     → composio-linux-x64
 *   bun-linux-arm64   → composio-linux-aarch64
 *
 * Output: `dist/binaries/<artifact-name>`
 */

import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { Config, ConfigProvider, Console, Effect, Stream, Logger, Layer, LogLevel } from 'effect';
import { Command } from '@effect/platform';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import { teardown } from './_shared';

/**
 * Maps Bun cross-compilation targets to Composio artifact names.
 */
const TARGET_MAP: Record<string, string> = {
  'bun-darwin-arm64': 'composio-darwin-aarch64',
  'bun-darwin-x64': 'composio-darwin-x64',
  'bun-linux-x64': 'composio-linux-x64',
  'bun-linux-arm64': 'composio-linux-aarch64',
};

const VALID_TARGETS = Object.keys(TARGET_MAP);

const RUN_COMPANION_MODULE_BASENAMES = [
  'run-subagent-shared',
  'run-subagent-acp',
  'run-subagent-legacy',
] as const;

function parseTarget(): { target: string; artifact: string } {
  const targetIdx = process.argv.indexOf('--target');
  if (targetIdx === -1 || !process.argv[targetIdx + 1]) {
    process.stderr.write(`Usage: bun scripts/build-binary-cross.ts --target <target>\n`);
    process.stderr.write(`Valid targets: ${VALID_TARGETS.join(', ')}\n`);
    process.exit(1);
  }

  const target = process.argv[targetIdx + 1];
  const artifact = TARGET_MAP[target];
  if (!artifact) {
    process.stderr.write(`Invalid target: ${target}\n`);
    process.stderr.write(`Valid targets: ${VALID_TARGETS.join(', ')}\n`);
    process.exit(1);
  }

  return { target, artifact };
}

export function buildBinaryCross() {
  const { target, artifact } = parseTarget();

  return Effect.gen(function* () {
    const cwd = process.cwd();
    yield* Effect.logDebug(`Cross-compiling binary in ${cwd} for target ${target}`);

    const outfile = `./dist/binaries/${artifact}`;

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

    yield* Effect.logDebug('Running build command with', args.join(' '), '');

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

    process.exitCode = exitCode;

    if (exitCode !== 0) {
      return yield* Effect.fail(new Error(`Failed to cross-compile binary for ${target}`));
    }

    const companionOutputDir = './dist/binaries/companions';
    yield* Effect.tryPromise(() => mkdir(companionOutputDir, { recursive: true }));

    for (const name of RUN_COMPANION_MODULE_BASENAMES) {
      const companionArgs = [
        'bun',
        'build',
        `./src/services/${name}.ts`,
        '--outfile',
        `${companionOutputDir}/${name}.mjs`,
        '--format',
        'esm',
        '--target',
        'bun',
      ] as const satisfies ReadonlyArray<string>;

      const companionCmd = Command.make(...companionArgs);
      const { exitCode: companionExitCode } = yield* companionCmd.pipe(
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

      if (companionExitCode !== 0) {
        return yield* Effect.fail(new Error(`Failed to build companion module: ${name}`));
      }
    }

    yield* Console.log(`Binary cross-compiled: ${outfile}`);
  });
}

const ConfigLive = Effect.gen(function* () {
  const logLevel = yield* Config.logLevel('COMPOSIO_LOG_LEVEL').pipe(
    Config.withDefault(LogLevel.Info)
  );

  return Logger.minimumLogLevel(logLevel);
}).pipe(Layer.unwrapEffect, Layer.merge(Layer.setConfigProvider(ConfigProvider.fromEnv())));

if (require.main === module) {
  buildBinaryCross().pipe(
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
