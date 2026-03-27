import { chmod, copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import process from 'node:process';
import { gunzipSync } from 'node:zlib';
import { Cause, Effect, Exit } from 'effect';
import type { Teardown } from '@effect/platform/Runtime';
import {
  collectRunCompanionAssetRelativePaths,
  RUN_COMPANION_MODULE_BASENAMES,
} from '../src/services/run-companion-modules';

const ACP_ADAPTERS_SOURCE_DIR = path.resolve('./acp-adapters');

/**
 * Resolves the path to `cli.js` from `@anthropic-ai/claude-agent-sdk`.
 *
 * The bundled `claude-code-acp.mjs` adapter uses `import.meta.url` to locate
 * `cli.js` at runtime (it expects it in the same directory as the adapter).
 * We resolve it via the transitive dependency chain so the correct version
 * that matches the bundled adapter is always used.
 */
const resolveClaudeAgentSdkCliPath = (): string => {
  const req = createRequire(import.meta.url);
  const claudeCodeAcpPkg = req.resolve('@zed-industries/claude-code-acp/package.json');
  const req2 = createRequire(claudeCodeAcpPkg);
  const agentSdkPkg = req2.resolve('@anthropic-ai/claude-agent-sdk/package.json');
  return path.join(path.dirname(agentSdkPkg), 'cli.js');
};

const copyDirectoryRecursive = async (sourceDir: string, targetDir: string): Promise<void> => {
  await mkdir(targetDir, { recursive: true });

  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(sourcePath, targetPath);
      continue;
    }

    if (entry.name.endsWith('.gz')) {
      const decompressedTargetPath = targetPath.slice(0, -3);
      await writeFile(decompressedTargetPath, gunzipSync(await readFile(sourcePath)));
      await chmod(decompressedTargetPath, 0o755);
      continue;
    }

    await copyFile(sourcePath, targetPath);
    const mode = (await stat(sourcePath)).mode & 0o777;
    await chmod(targetPath, mode || 0o755);
  }
};

const copyBundledAcpAdapters = async (outputDir: string): Promise<void> => {
  const claudeAdapterPath = path.join(ACP_ADAPTERS_SOURCE_DIR, 'claude-code-acp.mjs');
  if (!(await Bun.file(claudeAdapterPath).exists())) {
    throw new Error(
      `Missing bundled ACP adapter assets in ${ACP_ADAPTERS_SOURCE_DIR}. Regenerate the vendored adapters before building binaries.`
    );
  }

  const acpOutputDir = path.join(outputDir, 'acp-adapters');
  await copyDirectoryRecursive(ACP_ADAPTERS_SOURCE_DIR, acpOutputDir);

  // The bundled claude-code-acp.mjs adapter uses `import.meta.url` to resolve
  // `cli.js` at runtime — it expects it in the same directory as the adapter.
  // Copy it from the @anthropic-ai/claude-agent-sdk package so the packaged
  // binary is self-contained and does not depend on any system installation.
  const cliSrcPath = resolveClaudeAgentSdkCliPath();
  const cliDstPath = path.join(acpOutputDir, 'cli.js');
  await copyFile(cliSrcPath, cliDstPath);
  await chmod(cliDstPath, 0o755);
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
