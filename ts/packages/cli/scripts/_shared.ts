import { builtinModules } from 'node:module';
import { chmod, copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import process from 'node:process';
import { Effect } from 'effect';
import {
  codexAcpBinaryTargetFor,
  RUN_CODEX_ACP_BINARY_TARGETS,
  RUN_COMPANION_MODULE_BASENAMES,
  type RunCodexAcpBinaryTarget,
} from '../src/services/run-companion-modules';
import { materializeAcpAdaptersCache } from './_acp-adapters';

export { teardown } from './_teardown';

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

const copyBundledAcpAdapters = async (
  outputDir: string,
  codexBinaryTargets: ReadonlyArray<RunCodexAcpBinaryTarget>
): Promise<void> => {
  const acpAdaptersCacheDir = await materializeAcpAdaptersCache(codexBinaryTargets);
  const acpOutputDir = path.join(outputDir, 'acp-adapters');
  await rm(acpOutputDir, { force: true, recursive: true });
  await copyDirectoryRecursive(acpAdaptersCacheDir, acpOutputDir);
};

// The codex-acp binary the building machine can actually execute. Unsupported
// hosts get an empty list, matching the host requirement set the CLI checks.
export const hostCodexAcpBinaryTargets = (): ReadonlyArray<RunCodexAcpBinaryTarget> => {
  const hostTarget = codexAcpBinaryTargetFor({
    platform: process.platform,
    arch: process.arch,
  });
  return hostTarget ? [hostTarget] : [];
};

export const LOCAL_TOOLS_BINARY_ASSET_DIRNAME = 'local-tools-binaries';

// Kept out of --env: Bun honors only the last --env, which would clobber DEBUG_OVERRIDE_*.
export const posthogBakeArgs = (): ReadonlyArray<string> => {
  const key = process.env.COMPOSIO_POSTHOG_PROJECT_API_KEY?.trim();
  return key ? ['--define', `COMPOSIO_POSTHOG_PROJECT_API_KEY_BAKED=${JSON.stringify(key)}`] : [];
};

const localToolsBinaryAssetsSourceDir = (): string =>
  path.resolve(process.cwd(), '../cli-local-tools', LOCAL_TOOLS_BINARY_ASSET_DIRNAME);

const copyLocalToolBinaryAssetsDirectory = async (outputDir: string): Promise<boolean> => {
  const sourceDir = localToolsBinaryAssetsSourceDir();
  const sourceExists = await stat(sourceDir)
    .then(stats => stats.isDirectory())
    .catch(() => false);
  if (!sourceExists) return false;

  const outputAssetDir = path.join(outputDir, LOCAL_TOOLS_BINARY_ASSET_DIRNAME);
  await rm(outputAssetDir, { force: true, recursive: true });
  await copyDirectoryRecursive(sourceDir, outputAssetDir);
  return true;
};

export const copyLocalToolBinaryAssets = (outputDir: string) =>
  Effect.gen(function* () {
    const copied = yield* Effect.tryPromise(() => copyLocalToolBinaryAssetsDirectory(outputDir));
    if (copied) {
      yield* Effect.logDebug(
        `Copied local tool binary assets into ${path.join(outputDir, LOCAL_TOOLS_BINARY_ASSET_DIRNAME)}`
      );
    }
  });

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
      // The literal's body is dropped rather than blanked out. Blanking kept a
      // same-length run of spaces, and once a bundle carries a multi-megabyte
      // string with newlines in it (the TypeScript compiler's embedded lib
      // files, in `generation-runtime`), the `^\s*` prefix of the import
      // patterns below backtracks across that run from every line start —
      // quadratic, and it stalled the build for over ten minutes.
      result += ' ';
      index += 1;

      while (index < source.length) {
        const current = source[index];
        index += 1;

        if (current === '\\') {
          index += 1;
          continue;
        }

        if (current === quote) {
          break;
        }
      }

      result += ' ';
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

// Module paths that must only ever be reached through a companion module. The
// executable's bundle is checked after every build because the guard against
// regressions is otherwise invisible: a stray static import of any of these
// would silently put the TypeScript compiler or the tokenizer rank table back
// into the executable, and `--version` would quietly get ~70ms slower.
const EXECUTABLE_EXCLUDED_MODULE_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly reason: string;
}> = [
  { pattern: /\/node_modules\/typescript\//, reason: 'the TypeScript compiler' },
  { pattern: /\/node_modules\/js-tiktoken\//, reason: 'the tokenizer and its rank table' },
  { pattern: /(?:^|\/)src\/generation\/(?!errors\.ts$)/, reason: 'the generation pipeline' },
  {
    pattern: /(?:^|\/)src\/commands\/run-source-transforms\.ts$/,
    reason: 'the run source rewrites',
  },
  { pattern: /(?:^|\/)src\/services\/generation-runtime\.ts$/, reason: 'the generation companion' },
  {
    pattern: /(?:^|\/)src\/services\/execute-output-encoder-runtime\.ts$/,
    reason: 'the encoder companion',
  },
];

// Bun's unminified output starts each module with a `// <path>` line, which is
// the only bundle-level record of what made it into the graph. A dynamic
// `import()` of a *literal* specifier is still bundled (lazily evaluated, but
// parsed on every start), so this catches those too — only the runtime-computed
// specifier in `loadInstalledCompanionModule` keeps a module out.
const assertExecutableExcludesCompanionModules = async (): Promise<void> => {
  const result = await Bun.build({
    entrypoints: [path.resolve('./src/bin.ts')],
    target: 'bun',
    format: 'esm',
    packages: 'bundle',
    minify: false,
    sourcemap: 'none',
  });
  if (!result.success) {
    throw new Error(
      `Failed to bundle src/bin.ts for the executable graph check:\n${result.logs
        .map(log => log.message)
        .join('\n')}`
    );
  }

  const violations: string[] = [];
  for (const artifact of result.outputs) {
    const source = await artifact.text();
    for (const line of source.split('\n')) {
      if (!line.startsWith('// ') || line.startsWith('// @bun')) {
        continue;
      }
      const modulePath = line.slice(3);
      const hit = EXECUTABLE_EXCLUDED_MODULE_PATTERNS.find(({ pattern }) =>
        pattern.test(modulePath)
      );
      if (hit) {
        violations.push(`${modulePath}  (${hit.reason})`);
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      [
        'The executable bundle reaches modules that must only be loaded through a companion module',
        '(see RUN_COMPANION_MODULE_BASENAMES). Import them via `loadInstalledCompanionModule` instead:',
        ...violations.map(violation => `  - ${violation}`),
      ].join('\n')
    );
  }
};

export const buildCompanionModules = (
  outputDir: string,
  options: {
    readonly codexBinaryTargets?: ReadonlyArray<RunCodexAcpBinaryTarget>;
  } = {}
) =>
  Effect.gen(function* () {
    yield* Effect.tryPromise(() => mkdir(outputDir, { recursive: true }));

    yield* Effect.tryPromise(() => buildCompanionServiceBundles(outputDir));

    for (const name of RUN_COMPANION_MODULE_BASENAMES) {
      const wrapperPath = path.join(outputDir, `${name}.mjs`);
      const wrapperSource = `export * from "./services/${name}.mjs";\n`;
      yield* Effect.tryPromise(() => writeFile(wrapperPath, wrapperSource, 'utf8'));
    }

    yield* Effect.tryPromise(() =>
      copyBundledAcpAdapters(outputDir, options.codexBinaryTargets ?? RUN_CODEX_ACP_BINARY_TARGETS)
    );
    yield* Effect.tryPromise(() => assertBundledRuntimeFiles(outputDir));
    yield* Effect.tryPromise(() => assertExecutableExcludesCompanionModules());
  });
