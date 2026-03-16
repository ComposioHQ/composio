import path from 'node:path';
import { Command, FileSystem } from '@effect/platform';
import { Effect, Match } from 'effect';
import {
  ProjectEnvironmentDetector,
  type JsLanguage,
  type JsPackageManager,
  type PythonPackageManager,
} from 'src/services/project-environment-detector';
import { getAncestors } from 'src/utils/get-ancestors';

export type CoreDependencyPlan =
  | {
      kind: 'js';
      language: JsLanguage;
      packageManager: JsPackageManager;
      rootDir: string;
      dependency: '@composio/core';
      installCommand: string;
    }
  | {
      kind: 'python';
      language: 'python';
      packageManager: PythonPackageManager;
      rootDir: string;
      dependency: 'composio';
      installCommand: string;
    };

export type CoreDependencyVersion = {
  version: string;
  source: 'package.json' | 'node_modules' | 'python';
};

export const getJsInstallCommand = (pm: JsPackageManager, dependency: string) =>
  Match.value(pm).pipe(
    Match.when('pnpm', () => `pnpm add ${dependency}`),
    Match.when('bun', () => `bun add ${dependency}`),
    Match.when('yarn', () => `yarn add ${dependency}`),
    Match.when('npm', () => `npm install -S ${dependency}`),
    Match.when('deno', () => `deno add npm:${dependency}`),
    Match.exhaustive
  );

export const getPythonInstallCommand = (pm: PythonPackageManager, dependency: string) =>
  pm === 'uv' ? `uv pip install ${dependency}` : `pip install ${dependency}`;

export const detectCoreDependencyPlan = (cwd: string) =>
  Effect.gen(function* () {
    const envDetector = yield* ProjectEnvironmentDetector;
    const env = yield* envDetector.detectProjectEnvironment(cwd);

    if (env.kind === 'python') {
      return {
        kind: 'python',
        language: 'python',
        packageManager: env.packageManager,
        rootDir: env.rootDir,
        dependency: 'composio',
        installCommand: getPythonInstallCommand(env.packageManager, 'composio'),
      } satisfies CoreDependencyPlan;
    }

    return {
      kind: 'js',
      language: env.language,
      packageManager: env.packageManager,
      rootDir: env.rootDir,
      dependency: '@composio/core',
      installCommand: getJsInstallCommand(env.packageManager, '@composio/core'),
    } satisfies CoreDependencyPlan;
  });

const readPackageJson = (fs: FileSystem.FileSystem, dir: string) =>
  fs.readFileString(path.join(dir, 'package.json')).pipe(
    Effect.andThen(content =>
      Effect.try({
        try: () => JSON.parse(content) as Record<string, unknown>,
        catch: () => null,
      })
    ),
    Effect.catchAll(() => Effect.succeed(null))
  );

const findDependencySpec = (pkg: Record<string, unknown>, name: string) => {
  const deps = (pkg.dependencies ?? {}) as Record<string, string>;
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
  const peerDeps = (pkg.peerDependencies ?? {}) as Record<string, string>;
  const optionalDeps = (pkg.optionalDependencies ?? {}) as Record<string, string>;

  return deps[name] ?? devDeps[name] ?? peerDeps[name] ?? optionalDeps[name] ?? null;
};

const detectJsDependencyVersion = (
  fs: FileSystem.FileSystem,
  plan: Extract<CoreDependencyPlan, { kind: 'js' }>
) =>
  Effect.gen(function* () {
    const dirs = getAncestors(plan.rootDir);

    for (const dir of dirs) {
      const packageJsonPath = path.join(dir, 'node_modules', '@composio', 'core', 'package.json');
      const content = yield* fs
        .readFileString(packageJsonPath)
        .pipe(Effect.catchAll(() => Effect.succeed<string | null>(null)));

      if (content) {
        const parsed = yield* Effect.try({
          try: () => JSON.parse(content) as { version?: string },
          catch: () => null,
        }).pipe(Effect.catchAll(() => Effect.succeed(null)));

        if (parsed?.version) {
          return {
            version: parsed.version,
            source: 'node_modules',
          } satisfies CoreDependencyVersion;
        }
      }

      if (plan.packageManager === 'pnpm') {
        const pnpmStore = path.join(dir, 'node_modules', '.pnpm');
        const entries = yield* fs
          .readDirectory(pnpmStore)
          .pipe(Effect.catchAll(() => Effect.succeed<string[]>([])));
        const match = entries.find(entry => entry.startsWith('@composio+core@'));
        if (!match) {
          continue;
        }
        const pnpmPkgPath = path.join(
          pnpmStore,
          match,
          'node_modules',
          '@composio',
          'core',
          'package.json'
        );
        const pnpmContent = yield* fs
          .readFileString(pnpmPkgPath)
          .pipe(Effect.catchAll(() => Effect.succeed<string | null>(null)));

        if (pnpmContent) {
          const pnpmParsed = yield* Effect.try({
            try: () => JSON.parse(pnpmContent) as { version?: string },
            catch: () => null,
          }).pipe(Effect.catchAll(() => Effect.succeed(null)));

          if (pnpmParsed?.version) {
            return {
              version: pnpmParsed.version,
              source: 'node_modules',
            } satisfies CoreDependencyVersion;
          }
        }
      }
    }

    for (const dir of dirs) {
      const pkg = yield* readPackageJson(fs, dir);
      if (!pkg) {
        continue;
      }
      const spec = findDependencySpec(pkg, plan.dependency);
      if (spec) {
        return {
          version: spec,
          source: 'package.json',
        } satisfies CoreDependencyVersion;
      }
    }

    return null;
  });

const detectPythonDependencyVersion = (plan: Extract<CoreDependencyPlan, { kind: 'python' }>) =>
  Effect.gen(function* () {
    const [cmd, ...args] =
      plan.packageManager === 'uv'
        ? [
            'uv',
            'run',
            'python',
            '-c',
            "import importlib.metadata as m; print(m.version('composio'))",
          ]
        : ['python', '-c', "import importlib.metadata as m; print(m.version('composio'))"];

    const stdout = yield* Command.make(cmd, ...args).pipe(
      Command.string,
      Effect.catchAll(() => Effect.succeed<string | null>(null))
    );

    if (!stdout) {
      return null;
    }

    const version = stdout.trim();
    if (!version) {
      return null;
    }

    return {
      version,
      source: 'python',
    } satisfies CoreDependencyVersion;
  });

export const detectCoreDependencyVersion = (plan: CoreDependencyPlan) =>
  Effect.gen(function* () {
    if (plan.kind === 'python') {
      return yield* detectPythonDependencyVersion(plan);
    }

    const fs = yield* FileSystem.FileSystem;
    return yield* detectJsDependencyVersion(fs, plan);
  });

export const resolveCoreDependencyState = (cwd: string) =>
  Effect.gen(function* () {
    const plan = yield* detectCoreDependencyPlan(cwd);
    const installedVersion = yield* detectCoreDependencyVersion(plan);

    return {
      plan,
      installedVersion,
    } as const;
  });
