#!/usr/bin/env bun

/**
 * Package each raw binary in `dist/binaries/` into a `.zip` archive.
 *
 * Usage: `bun scripts/package-binaries.ts`
 *
 * Creates a nested directory structure inside each zip:
 *   composio-<target>/composio
 *
 * This matches the structure expected by `install.sh`.
 *
 * Input:  `dist/binaries/composio-{platform-arch}` (raw binaries)
 * Output: `dist/binaries/composio-{platform-arch}.zip`
 */

import process from 'node:process';
import { Config, ConfigProvider, Console, Effect, Logger, Layer, LogLevel } from 'effect';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import { teardown } from './_shared';
import { $ } from 'bun';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { collectExpectedRunCompanionAssetRelativePaths } from '../src/services/run-companion-modules';

const BINARIES_DIR = './dist/binaries';
const COMPANIONS_DIR = path.join(BINARIES_DIR, 'companions');

/**
 * Known binary artifact names (without extension).
 */
const ARTIFACT_NAMES = [
  'composio-darwin-aarch64',
  'composio-darwin-x64',
  'composio-linux-x64',
  'composio-linux-aarch64',
];

export function packageBinaries() {
  return Effect.gen(function* () {
    const entries = yield* Effect.tryPromise(() => readdir(BINARIES_DIR));

    const binaries = entries.filter(entry => ARTIFACT_NAMES.includes(entry));

    if (binaries.length === 0) {
      yield* Console.error('No binaries found in dist/binaries/. Run build:binary:all first.');
      process.exitCode = 1;
      return;
    }

    const companionRelativePaths = collectExpectedRunCompanionAssetRelativePaths(COMPANIONS_DIR);
    for (const relativePath of companionRelativePaths) {
      const companionPath = path.join(COMPANIONS_DIR, relativePath);
      const exists = yield* Effect.tryPromise(() => Bun.file(companionPath).exists());
      if (!exists) {
        yield* Console.error(
          `Missing companion module ${companionPath}. Run build:binary:all before packaging.`
        );
        process.exitCode = 1;
        return;
      }
    }

    yield* Console.log(`Packaging ${binaries.length} binaries...`);

    for (const binary of binaries) {
      const binaryPath = path.join(BINARIES_DIR, binary);
      const zipPath = path.join(BINARIES_DIR, `${binary}.zip`);
      const absoluteZipPath = path.resolve(zipPath);

      // Create nested directory structure: <artifact>/<binary-name>
      const tempDir = path.join(BINARIES_DIR, `_pkg_${binary}`);
      const nestedDir = path.join(tempDir, binary);

      yield* Effect.tryPromise(async () => {
        await $`mkdir -p ${nestedDir}`.quiet();
        await $`cp ${binaryPath} ${nestedDir}/composio`.quiet();
        for (const relativePath of companionRelativePaths) {
          const targetDirectory = path.dirname(path.join(nestedDir, relativePath));
          await $`mkdir -p ${targetDirectory}`.quiet();
          await $`cp ${path.join(COMPANIONS_DIR, relativePath)} ${path.join(nestedDir, relativePath)}`.quiet();
        }
        const previousCwd = process.cwd();
        process.chdir(tempDir);
        try {
          await $`zip -r ${absoluteZipPath} ${binary}`.quiet();
        } finally {
          process.chdir(previousCwd);
        }
        await $`rm -rf ${tempDir}`.quiet();
      });

      const zipStat = yield* Effect.tryPromise(() => stat(zipPath));
      const sizeMB = (zipStat.size / (1024 * 1024)).toFixed(1);
      yield* Console.log(`  ${binary}.zip (${sizeMB} MB)`);
    }

    yield* Console.log(`\nAll ${binaries.length} archives created.`);
  });
}

const ConfigLive = Effect.gen(function* () {
  const logLevel = yield* Config.logLevel('COMPOSIO_LOG_LEVEL').pipe(
    Config.withDefault(LogLevel.Info)
  );

  return Logger.minimumLogLevel(logLevel);
}).pipe(Layer.unwrapEffect, Layer.merge(Layer.setConfigProvider(ConfigProvider.fromEnv())));

if (require.main === module) {
  packageBinaries().pipe(
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
