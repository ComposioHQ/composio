import { chmod, copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import process from 'node:process';
import { Cause, Effect, Exit } from 'effect';
import type { Teardown } from '@effect/platform/Runtime';
import {
  collectRunCompanionAssetRelativePaths,
  RUN_COMPANION_MODULE_BASENAMES,
} from '../src/services/run-companion-modules';
import { materializeAcpAdaptersCache } from './_acp-adapters';

const copyDirectoryRecursive = async (sourceDir: string, targetDir: string): Promise<void> => {
  await mkdir(targetDir, { recursive: true });

  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(sourcePath, targetPath);
      continue;
    }

    await copyFile(sourcePath, targetPath);
    const mode = (await stat(sourcePath)).mode & 0o777;
    await chmod(targetPath, mode || 0o755);
  }
};

const copyBundledAcpAdapters = async (outputDir: string): Promise<void> => {
  const acpAdaptersCacheDir = await materializeAcpAdaptersCache();
  const acpOutputDir = path.join(outputDir, 'acp-adapters');
  await copyDirectoryRecursive(acpAdaptersCacheDir, acpOutputDir);
};

/**
 * Shared teardown for all CLI scripts.
 *
 * Exits with a non-zero code when the Effect program fails
 * (unless the failure is an interrupt-only cause).
 */
export const teardown: Teardown = <E, A>(exit: Exit.Exit<E, A>, onExit: (code: number) => void) => {
  const shouldFail = Exit.isFailure(exit) && !Cause.isInterruptedOnly(exit.cause);
  const errorCode = Number(process.exitCode ?? 1);
  onExit(shouldFail ? errorCode : 0);
};

export const buildCompanionModules = (outputDir: string) =>
  Effect.gen(function* () {
    yield* Effect.tryPromise(() => mkdir(outputDir, { recursive: true }));

    const compiledRootDir = path.resolve('./dist');
    const companionRelativePaths = collectRunCompanionAssetRelativePaths(compiledRootDir);
    if (companionRelativePaths.length === 0) {
      return yield* Effect.fail(
        new Error('Missing compiled run companion modules. Run `pnpm build:packages` first.')
      );
    }

    for (const relativePath of companionRelativePaths) {
      const sourcePath = path.join(compiledRootDir, relativePath);
      const targetPath = path.join(outputDir, relativePath);

      yield* Effect.tryPromise(async () => {
        if (!(await Bun.file(sourcePath).exists())) {
          throw new Error(`Missing companion module: ${sourcePath}`);
        }
        if (path.resolve(sourcePath) === path.resolve(targetPath)) {
          return;
        }

        await mkdir(path.dirname(targetPath), { recursive: true });
        await copyFile(sourcePath, targetPath);
      });
    }

    for (const name of RUN_COMPANION_MODULE_BASENAMES) {
      const wrapperPath = path.join(outputDir, `${name}.mjs`);
      const wrapperSource = `export * from "./services/${name}.mjs";\n`;
      yield* Effect.tryPromise(() => writeFile(wrapperPath, wrapperSource, 'utf8'));
    }

    yield* Effect.tryPromise(() => copyBundledAcpAdapters(outputDir));
  });
