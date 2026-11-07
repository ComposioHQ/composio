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
import { Config, ConfigProvider, Console, Effect, Logger, Layer, References } from 'effect';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { teardown } from './_shared';
import { $ } from 'bun';
import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collectExpectedRunCompanionAssetRelativePaths } from '../src/services/run-companion-modules';
import { archiveCompanionEntries, ARTIFACT_NAMES } from './_release-artifacts';

const BINARIES_DIR = './dist/binaries';
const COMPANIONS_DIR = path.join(BINARIES_DIR, 'companions');
const RELEASE_TAG = process.env.RELEASE_TAG?.trim();

export function packageBinaries() {
  return Effect.gen(function* () {
    const entries = yield* Effect.tryPromise(() => readdir(BINARIES_DIR));

    const binaries = entries.filter(entry => ARTIFACT_NAMES.includes(entry));

    if (binaries.length === 0) {
      yield* Console.error('No binaries found in dist/binaries/. Run build:binary:all first.');
      process.exitCode = 1;
      return;
    }

    // Only the live companions come from `COMPANIONS_DIR`. The legacy placeholders
    // are written straight into each archive and exist nowhere else.
    const liveCompanionRelativePaths =
      yield* collectExpectedRunCompanionAssetRelativePaths(COMPANIONS_DIR);
    for (const relativePath of liveCompanionRelativePaths) {
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

    // See `archiveCompanionEntries` for why the legacy paths are present but empty.
    const companionEntries = archiveCompanionEntries(liveCompanionRelativePaths);

    for (const binary of binaries) {
      const binaryPath = path.join(BINARIES_DIR, binary);
      const zipPath = path.join(BINARIES_DIR, `${binary}.zip`);
      const absoluteZipPath = path.resolve(zipPath);

      // Create nested directory structure: <artifact>/<binary-name>
      const tempDir = path.join(BINARIES_DIR, `_pkg_${binary}`);
      const nestedDir = path.join(tempDir, binary);

      yield* Effect.tryPromise(async () => {
        await $`rm -f ${zipPath}`.quiet();
        await $`rm -rf ${tempDir}`.quiet();
        await $`mkdir -p ${nestedDir}`.quiet();
        await $`cp ${binaryPath} ${nestedDir}/composio`.quiet();
        for (const { relativePath, kind } of companionEntries) {
          const destinationPath = path.join(nestedDir, relativePath);
          await $`mkdir -p ${path.dirname(destinationPath)}`.quiet();
          if (kind === 'placeholder') {
            await writeFile(destinationPath, '');
            continue;
          }
          await $`cp ${path.join(COMPANIONS_DIR, relativePath)} ${destinationPath}`.quiet();
        }
        if (RELEASE_TAG) {
          await writeFile(path.join(nestedDir, 'release-tag.txt'), `${RELEASE_TAG}\n`, 'utf8');
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
  const logLevel = yield* Config.LogLevel('COMPOSIO_LOG_LEVEL').pipe(Config.withDefault('Info'));

  return Layer.succeed(References.MinimumLogLevel, logLevel);
}).pipe(Layer.unwrap, Layer.merge(ConfigProvider.layer(ConfigProvider.fromEnv())));

if (require.main === module) {
  packageBinaries().pipe(
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
