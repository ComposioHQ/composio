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
import { LOCAL_TOOLS_BINARY_ASSET_DIRNAME, teardown } from './_shared';
import { $ } from 'bun';
import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  collectExpectedRunCompanionAssetRelativePaths,
  RUN_COMPANION_ALL_STATIC_ASSET_RELATIVE_PATHS,
} from '../src/services/run-companion-modules';
import {
  archiveCompanionEntries,
  ARTIFACT_NAMES,
  releaseArtifactTargetFor,
} from './_release-artifacts';

const BINARIES_DIR = './dist/binaries';
const COMPANIONS_DIR = path.join(BINARIES_DIR, 'companions');
const LOCAL_TOOLS_BINARY_ASSETS_DIR = path.join(BINARIES_DIR, LOCAL_TOOLS_BINARY_ASSET_DIRNAME);
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

    // One packaging host produces all four archives, so `COMPANIONS_DIR` must hold
    // every platform's codex-acp binary before packaging starts.
    const allCompanionRelativePaths = yield* collectExpectedRunCompanionAssetRelativePaths(
      COMPANIONS_DIR,
      { staticAssetRelativePaths: RUN_COMPANION_ALL_STATIC_ASSET_RELATIVE_PATHS }
    );
    for (const relativePath of allCompanionRelativePaths) {
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
      // Every archive names all four codex-acp paths, but carries real bytes
      // only for the one its own `composio` binary can execute. See
      // `archiveCompanionEntries` for why the other three are present but empty.
      const target = yield* releaseArtifactTargetFor(binary);
      const companionEntries = archiveCompanionEntries({
        allRelativePaths: allCompanionRelativePaths,
        target,
      });

      const binaryPath = path.join(BINARIES_DIR, binary);
      const zipPath = path.join(BINARIES_DIR, `${binary}.zip`);
      const absoluteZipPath = path.resolve(zipPath);

      // Create nested directory structure: <artifact>/<binary-name>
      const tempDir = path.join(BINARIES_DIR, `_pkg_${binary}`);
      const nestedDir = path.join(tempDir, binary);

      yield* Effect.tryPromise(async () => {
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
        const hasLocalToolsBinaryAssets = await stat(LOCAL_TOOLS_BINARY_ASSETS_DIR)
          .then(stats => stats.isDirectory())
          .catch(() => false);
        if (hasLocalToolsBinaryAssets) {
          await $`cp -R ${LOCAL_TOOLS_BINARY_ASSETS_DIR} ${path.join(nestedDir, LOCAL_TOOLS_BINARY_ASSET_DIRNAME)}`.quiet();
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
