import { builtinModules } from 'node:module';
import { chmod, copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import process from 'node:process';
import { Cause, Effect, Exit } from 'effect';
import type { Teardown } from '@effect/platform/Runtime';
import { RUN_COMPANION_MODULE_BASENAMES } from '../src/services/run-companion-modules';
import { materializeAcpAdaptersCache } from './_acp-adapters';

const RUN_COMPANION_SERVICE_ENTRY_MAP = Object.fromEntries(
  RUN_COMPANION_MODULE_BASENAMES.map(name => [`services/${name}`, `src/services/${name}.ts`])
) satisfies Record<string, string>;

const allowedRuntimeSpecifiers = new Set(
  builtinModules.flatMap(specifier =>
    specifier.startsWith('node:')
      ? [specifier, specifier.slice('node:'.length)]
      : [specifier, `node:${specifier}`]
  )
);

const importStatementPattern = /(?:^|[;\n])\s*import\s+(?:[^'"`\n]+?\s+from\s+)?["']([^"']+)["']/gm;
const exportStatementPattern =
  /(?:^|[;\n])\s*export\s+(?:\*\s+from\s+|\{[^}\n]+\}\s+from\s+)["']([^"']+)["']/gm;
const runtimeImportCallPattern = /(?:^|[^\w$.])(?:__require|require|import)\(\s*["']([^"']+)["']/g;

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
  await rm(acpOutputDir, { force: true, recursive: true });
  await copyDirectoryRecursive(acpAdaptersCacheDir, acpOutputDir);
};

const isAllowedRuntimeSpecifier = (specifier: string): boolean =>
  specifier.startsWith('.') ||
  specifier.startsWith('/') ||
  specifier.startsWith('data:') ||
  specifier === 'bun' ||
  specifier.startsWith('bun:') ||
  allowedRuntimeSpecifiers.has(specifier);

const stripStringsAndComments = (source: string): string => {
  let result = '';
  let index = 0;

  const appendSpace = (char: string) => {
    result += char === '\n' ? '\n' : ' ';
  };

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "'" || char === '"' || char === '`') {
      const quote = char;
      appendSpace(char);
      index += 1;

      while (index < source.length) {
        const current = source[index];
        appendSpace(current);
        index += 1;

        if (current === '\\') {
          if (index < source.length) {
            appendSpace(source[index]!);
            index += 1;
          }
          continue;
        }

        if (current === quote) {
          break;
        }
      }

      continue;
    }

    if (char === '/' && next === '/') {
      appendSpace(char);
      appendSpace(next);
      index += 2;

      while (index < source.length) {
        const current = source[index];
        appendSpace(current);
        index += 1;
        if (current === '\n') {
          break;
        }
      }

      continue;
    }

    if (char === '/' && next === '*') {
      appendSpace(char);
      appendSpace(next);
      index += 2;

      while (index < source.length) {
        const current = source[index];
        const following = source[index + 1];
        appendSpace(current);
        index += 1;
        if (current === '*' && following === '/') {
          appendSpace(following);
          index += 1;
          break;
        }
      }

      continue;
    }

    result += char;
    index += 1;
  }

  return result;
};

const collectBundledSpecifiers = (source: string): ReadonlyArray<string> => {
  const sanitizedSource = stripStringsAndComments(source);
  const specifiers = new Set<string>();

  for (const pattern of [
    importStatementPattern,
    exportStatementPattern,
    runtimeImportCallPattern,
  ]) {
    for (const match of sanitizedSource.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) {
        specifiers.add(specifier);
      }
    }
  }

  return [...specifiers];
};

const collectJavaScriptFiles = async (directory: string): Promise<ReadonlyArray<string>> => {
  const collected: string[] = [];

  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      if (/\.(?:m?js|cjs)$/.test(entry.name)) {
        collected.push(entryPath);
      }
    }
  };

  await walk(directory);
  return collected.sort();
};

const collectRuntimeFiles = async (rootDir: string): Promise<ReadonlyArray<string>> => {
  const collected = new Set<string>();

  for (const baseName of RUN_COMPANION_MODULE_BASENAMES) {
    const wrapperPath = path.join(rootDir, `${baseName}.mjs`);
    if (await Bun.file(wrapperPath).exists()) {
      collected.add(wrapperPath);
    }
  }

  for (const relativeDir of ['services', 'acp-adapters']) {
    const absoluteDir = path.join(rootDir, relativeDir);
    const exists = await stat(absoluteDir)
      .then(stats => stats.isDirectory())
      .catch(() => false);
    if (!exists) {
      continue;
    }

    for (const filePath of await collectJavaScriptFiles(absoluteDir)) {
      collected.add(filePath);
    }
  }

  return [...collected].sort();
};

const assertBundledRuntimeFiles = async (rootDir: string): Promise<void> => {
  const files = await collectRuntimeFiles(rootDir);
  const violations: string[] = [];

  for (const filePath of files) {
    const source = await Bun.file(filePath).text();
    for (const specifier of collectBundledSpecifiers(source)) {
      if (!specifier || isAllowedRuntimeSpecifier(specifier)) {
        continue;
      }

      violations.push(`${path.relative(rootDir, filePath)} -> ${specifier}`);
    }
  }

  if (violations.length > 0) {
    throw new Error(
      [
        'Generated runtime support files still reference external packages:',
        ...violations.map(violation => `  - ${violation}`),
      ].join('\n')
    );
  }
};

const buildCompanionServiceBundles = async (outputDir: string): Promise<void> => {
  const servicesOutputDir = path.join(outputDir, 'services');
  await rm(servicesOutputDir, { force: true, recursive: true });
  await mkdir(servicesOutputDir, { recursive: true });

  for (const [entryName, entryPath] of Object.entries(RUN_COMPANION_SERVICE_ENTRY_MAP)) {
    const relativeOutputPath = `${entryName}.mjs`;
    const outputDirectory = path.join(outputDir, path.dirname(relativeOutputPath));
    const outputFileName = path.basename(relativeOutputPath);
    await mkdir(outputDirectory, { recursive: true });

    const result = await Bun.build({
      entrypoints: [path.resolve(entryPath)],
      outdir: outputDirectory,
      naming: outputFileName,
      target: 'bun',
      format: 'esm',
      packages: 'bundle',
      sourcemap: 'none',
    });

    if (!result.success) {
      const details = result.logs
        .map(log => log.message)
        .filter(message => message.length > 0)
        .join('\n');
      throw new Error(
        details.length > 0
          ? `Failed to bundle ${entryName}:\n${details}`
          : `Failed to bundle ${entryName}.`
      );
    }
  }
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

    yield* Effect.tryPromise(() => buildCompanionServiceBundles(outputDir));

    for (const name of RUN_COMPANION_MODULE_BASENAMES) {
      const wrapperPath = path.join(outputDir, `${name}.mjs`);
      const wrapperSource = `export * from "./services/${name}.mjs";\n`;
      yield* Effect.tryPromise(() => writeFile(wrapperPath, wrapperSource, 'utf8'));
    }

    yield* Effect.tryPromise(() => copyBundledAcpAdapters(outputDir));
    yield* Effect.tryPromise(() => assertBundledRuntimeFiles(outputDir));
  });
