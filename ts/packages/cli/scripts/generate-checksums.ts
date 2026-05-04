#!/usr/bin/env bun

/**
 * Generate `checksums.txt` from all `.zip` files in `dist/binaries/`.
 *
 * Usage: `bun scripts/generate-checksums.ts`
 *
 * Output format (sha256sum-compatible):
 *   <sha256hex>  composio-darwin-aarch64.zip
 *   <sha256hex>  composio-darwin-x64.zip
 *   <sha256hex>  composio-linux-x64.zip
 *   <sha256hex>  composio-linux-aarch64.zip
 *
 * Output: `dist/binaries/checksums.txt`
 */

import process from 'node:process';
import { Config, ConfigProvider, Console, Effect, Logger, Layer, LogLevel } from 'effect';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import { teardown } from './_shared';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BINARIES_DIR = './dist/binaries';

export function generateChecksums() {
  return Effect.gen(function* () {
    const entries = yield* Effect.tryPromise(() => readdir(BINARIES_DIR));
    const zipFiles = entries.filter(entry => entry.endsWith('.zip')).sort();

    if (zipFiles.length === 0) {
      yield* Console.error(
        'No .zip files found in dist/binaries/. Run build:binary:package first.'
      );
      process.exitCode = 1;
      return;
    }

    yield* Console.log(`Generating checksums for ${zipFiles.length} archives...`);

    const lines: string[] = [];

    for (const zipFile of zipFiles) {
      const filePath = path.join(BINARIES_DIR, zipFile);
      const data = yield* Effect.tryPromise(() => readFile(filePath));
      const hashBuffer = yield* Effect.tryPromise(() => crypto.subtle.digest('SHA-256', data));
      const hash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      lines.push(`${hash}  ${zipFile}`);
      yield* Console.log(`  ${hash}  ${zipFile}`);
    }

    const checksumsPath = path.join(BINARIES_DIR, 'checksums.txt');
    yield* Effect.tryPromise(() => writeFile(checksumsPath, lines.join('\n') + '\n'));

    yield* Console.log(`\nWritten: ${checksumsPath}`);
  });
}

const ConfigLive = Effect.gen(function* () {
  const logLevel = yield* Config.logLevel('COMPOSIO_LOG_LEVEL').pipe(
    Config.withDefault(LogLevel.Info)
  );

  return Logger.minimumLogLevel(logLevel);
}).pipe(Layer.unwrapEffect, Layer.merge(Layer.setConfigProvider(ConfigProvider.fromEnv())));

if (require.main === module) {
  generateChecksums().pipe(
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
