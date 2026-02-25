import { BunFileSystem } from '@effect/platform-bun';
import { FileSystem } from '@effect/platform';
import { Data, Effect, Match } from 'effect';
import * as path from 'node:path';
import process from 'node:process';
import { getAncestors } from 'src/utils/get-ancestors';

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export type JsLanguage = 'typescript' | 'javascript';
export type JsPackageManager = 'pnpm' | 'bun' | 'yarn' | 'npm' | 'deno';
export type PythonPackageManager = 'uv' | 'pip';

export type ProjectEnvironment =
  | {
      kind: 'js';
      language: JsLanguage;
      packageManager: JsPackageManager;
      rootDir: string;
      evidence: string[];
    }
  | {
      kind: 'python';
      language: 'python';
      packageManager: PythonPackageManager;
      rootDir: string;
      evidence: string[];
    };

export class ProjectEnvironmentDetectorError extends Data.TaggedError(
  'services/ProjectEnvironmentDetectorError'
)<{
  readonly cause: Error;
  readonly message: string;
  readonly checkedPaths: string[];
  readonly details?: string;
}> {}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JS_LOCK_FILES: Record<JsPackageManager, string[]> = {
  pnpm: ['pnpm-lock.yaml', 'pnpm-workspace.yaml'],
  bun: ['bun.lockb', 'bun.lock'],
  yarn: ['yarn.lock'],
  npm: ['package-lock.json', 'npm-shrinkwrap.json'],
  deno: ['deno.lock', 'deno.lock.json'],
};

const PYTHON_INDICATORS = new Set([
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'requirements.txt',
  'requirements-dev.txt',
  'requirements.in',
  'pipfile',
  'pipfile.lock',
  'poetry.lock',
  'uv.lock',
  'environment.yml',
  'conda.yaml',
  'tox.ini',
  'pytest.ini',
]);

const JS_CONFIG_FILES = new Set(['jsconfig.json', 'deno.json', 'deno.jsonc']);

const COMMON_SOURCE_DIRS = ['src', 'lib', 'app', 'apps', 'packages', 'scripts'];

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type DirEvidence = {
  dir: string;
  jsScore: number;
  tsScore: number;
  pyScore: number;
  strongJs: boolean;
  strongPy: boolean;
  jsHints: {
    tsConfig: boolean;
    tsDependency: boolean;
    tsFiles: boolean;
    jsFiles: boolean;
    denoConfig: boolean;
  };
  evidence: string[];
};

// ---------------------------------------------------------------------------
// Pure helpers (no dependencies)
// ---------------------------------------------------------------------------

const isTsConfig = (name: string) => {
  const lower = name.toLowerCase();
  return lower === 'tsconfig.json' || (lower.startsWith('tsconfig.') && lower.endsWith('.json'));
};

const countExtensions = (files: string[]) => {
  let ts = 0;
  let js = 0;
  let py = 0;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.ts' || ext === '.tsx' || ext === '.mts' || ext === '.cts') {
      ts += 1;
    } else if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') {
      js += 1;
    } else if (ext === '.py' || ext === '.pyi' || ext === '.pyw' || ext === '.pyx') {
      py += 1;
    }
  }

  return { ts, js, py };
};

const chooseJsLanguage = (evidence: DirEvidence): JsLanguage => {
  if (evidence.tsScore > evidence.jsScore) return 'typescript';
  if (evidence.jsScore > evidence.tsScore) return 'javascript';
  if (evidence.jsHints.tsConfig || evidence.jsHints.tsDependency) return 'typescript';
  if (evidence.jsHints.tsFiles && !evidence.jsHints.jsFiles) return 'typescript';
  if (evidence.jsHints.jsFiles && !evidence.jsHints.tsFiles) return 'javascript';
  if (evidence.jsHints.denoConfig) return 'typescript';
  return 'javascript';
};

const pickBestWeak = (candidate: DirEvidence, depth: number) => {
  const bestScore = Math.max(candidate.tsScore, candidate.jsScore, candidate.pyScore);
  if (bestScore <= 0) return null;
  const language =
    candidate.pyScore >= candidate.tsScore && candidate.pyScore >= candidate.jsScore
      ? 'python'
      : chooseJsLanguage(candidate);
  return {
    dir: candidate.dir,
    depth,
    language,
    score: bestScore - depth * 0.5,
    evidence: candidate,
  } as const;
};

const parsePackageManagerField = (pm: string) =>
  Match.value(pm).pipe(
    Match.when(
      pm => pm.startsWith('pnpm@'),
      () => 'pnpm' as const
    ),
    Match.when(
      pm => pm.startsWith('bun@'),
      () => 'bun' as const
    ),
    Match.when(
      pm => pm.startsWith('yarn@'),
      () => 'yarn' as const
    ),
    Match.when(
      pm => pm.startsWith('npm@'),
      () => 'npm' as const
    ),
    Match.orElse(() => null)
  );

/**
 * Detect package manager from the `npm_config_user_agent` env var.
 * Set automatically when running via `npx`, `pnpm dlx`, `bunx`, etc.
 * Inspired by https://github.com/prisma/create-prisma/blob/main/src/utils/package-manager.ts
 */
const parseUserAgent = (userAgent: string | undefined): JsPackageManager | null => {
  if (!userAgent) return null;
  if (userAgent.startsWith('pnpm')) return 'pnpm';
  if (userAgent.startsWith('bun')) return 'bun';
  if (userAgent.startsWith('yarn')) return 'yarn';
  if (userAgent.startsWith('npm')) return 'npm';
  return null;
};

// ---------------------------------------------------------------------------
// FS helpers (take FileSystem as parameter)
// ---------------------------------------------------------------------------

const makeReadDirectoryOptional = (fs: FileSystem.FileSystem) => (dir: string) =>
  fs.readDirectory(dir).pipe(Effect.catchAll(() => Effect.succeed<string[]>([])));

const makeReadFileStringOptional = (fs: FileSystem.FileSystem) => (filePath: string) =>
  fs.readFileString(filePath).pipe(Effect.catchAll(() => Effect.succeed<string | null>(null)));

const makeReadPackageJson = (fs: FileSystem.FileSystem) => {
  const readFileStringOptional = makeReadFileStringOptional(fs);
  return (dir: string) =>
    Effect.gen(function* () {
      const content = yield* readFileStringOptional(path.join(dir, 'package.json'));
      if (!content) return null;
      return yield* Effect.try({
        try: () => JSON.parse(content) as Record<string, unknown>,
        catch: toError,
      }).pipe(Effect.catchAll(() => Effect.succeed(null)));
    });
};

// ---------------------------------------------------------------------------
// Analysis (split into focused functions)
// ---------------------------------------------------------------------------

const analyzeDirectory = (
  fs: FileSystem.FileSystem,
  dir: string
): Effect.Effect<DirEvidence, ProjectEnvironmentDetectorError> =>
  Effect.gen(function* () {
    const files = yield* fs.readDirectory(dir).pipe(
      Effect.mapError(
        e =>
          new ProjectEnvironmentDetectorError({
            cause: toError(e),
            message: `Failed to read directory ${dir}`,
            checkedPaths: [dir],
          })
      )
    );
    const readDirectoryOptional = makeReadDirectoryOptional(fs);
    const readFileStringOptional = makeReadFileStringOptional(fs);
    const readPackageJson = makeReadPackageJson(fs);

    const lowerFiles = files.map(file => file.toLowerCase());
    const fileSet = new Set(lowerFiles);
    const fileByLower = new Map<string, string>();
    for (const file of files) {
      const lower = file.toLowerCase();
      if (!fileByLower.has(lower)) fileByLower.set(lower, file);
    }

    let jsScore = 0;
    let tsScore = 0;
    let pyScore = 0;
    let strongJs = false;
    let strongPy = false;
    const evidence: string[] = [];
    const jsHints = {
      tsConfig: false,
      tsDependency: false,
      tsFiles: false,
      jsFiles: false,
      denoConfig: false,
    };

    // Score file indicators
    for (const file of lowerFiles) {
      if (file === 'package.json') {
        strongJs = true;
        jsScore += 3;
        evidence.push('package.json');
      }
      if (JS_CONFIG_FILES.has(file)) {
        strongJs = true;
        jsScore += 3;
        if (file === 'deno.json' || file === 'deno.jsonc') {
          jsHints.denoConfig = true;
          tsScore += 2;
          evidence.push(file);
        }
      }
      if (isTsConfig(file)) {
        strongJs = true;
        tsScore += 5;
        jsHints.tsConfig = true;
        evidence.push('tsconfig');
      }
      if (file === 'jsconfig.json') {
        strongJs = true;
        jsScore += 4;
        evidence.push('jsconfig.json');
      }
      if (file === 'pnpm-workspace.yaml') {
        strongJs = true;
        jsScore += 3;
        evidence.push('pnpm-workspace.yaml');
      }
      if (PYTHON_INDICATORS.has(file)) {
        strongPy = true;
        pyScore += 3;
        evidence.push(file);
        if (file === 'uv.lock') pyScore += 2;
      }
    }

    // Score JS lock files
    for (const [, lockFiles] of Object.entries(JS_LOCK_FILES)) {
      if (lockFiles.some(lf => fileSet.has(lf))) {
        strongJs = true;
        jsScore += 4;
        evidence.push(lockFiles.find(lf => fileSet.has(lf)) ?? lockFiles[0]);
      }
    }

    // Score from package.json content
    const packageJson = yield* readPackageJson(dir);
    if (packageJson) {
      const deps = (packageJson.dependencies ?? {}) as Record<string, string>;
      const devDeps = (packageJson.devDependencies ?? {}) as Record<string, string>;
      if ({ ...deps, ...devDeps }.typescript) {
        tsScore += 4;
        jsHints.tsDependency = true;
        evidence.push('typescript dependency');
      }
      const pm =
        typeof packageJson.packageManager === 'string'
          ? parsePackageManagerField(packageJson.packageManager)
          : null;
      if (pm) {
        jsScore += 2;
        strongJs = true;
        evidence.push(`packageManager:${pm}`);
      }
    }

    // Score from pyproject.toml content
    const pyProject = yield* readFileStringOptional(path.join(dir, 'pyproject.toml'));
    if (pyProject) {
      const hasPythonSections = [
        '[project]',
        '[tool.poetry]',
        '[tool.setuptools]',
        '[tool.uv]',
        '[build-system]',
      ].some(s => pyProject.includes(s));
      if (hasPythonSections) {
        strongPy = true;
        pyScore += 2;
      }
    }

    // Score from file extensions
    const extensionCounts = countExtensions(files);
    if (extensionCounts.ts > 0) {
      tsScore += Math.min(3, extensionCounts.ts);
      jsHints.tsFiles = true;
    }
    if (extensionCounts.js > 0) {
      jsScore += Math.min(3, extensionCounts.js);
      jsHints.jsFiles = true;
    }
    if (extensionCounts.py > 0) {
      pyScore += Math.min(3, extensionCounts.py);
    }

    // Score from subdirectory extensions
    for (const subdir of COMMON_SOURCE_DIRS) {
      if (!fileSet.has(subdir)) continue;
      const actualSubdir = fileByLower.get(subdir) ?? subdir;
      const subFiles = yield* readDirectoryOptional(path.join(dir, actualSubdir));
      const subCounts = countExtensions(subFiles);
      if (subCounts.ts > 0) {
        tsScore += Math.min(2, subCounts.ts);
        jsHints.tsFiles = true;
      }
      if (subCounts.js > 0) {
        jsScore += Math.min(2, subCounts.js);
        jsHints.jsFiles = true;
      }
      if (subCounts.py > 0) {
        pyScore += Math.min(2, subCounts.py);
      }
    }

    return {
      dir,
      jsScore,
      tsScore,
      pyScore,
      strongJs,
      strongPy,
      jsHints,
      evidence,
    } satisfies DirEvidence;
  });

// ---------------------------------------------------------------------------
// Detection functions
// ---------------------------------------------------------------------------

const detectLanguage = (fs: FileSystem.FileSystem, cwd: string) =>
  Effect.gen(function* () {
    const dirs = getAncestors(cwd);
    let bestWeak: ReturnType<typeof pickBestWeak> | null = null;
    let ambiguous: { dir: string; details: string } | null = null;

    for (const [depth, dir] of dirs.entries()) {
      const evidence = yield* analyzeDirectory(fs, dir);

      if (evidence.strongJs && evidence.strongPy) {
        if (depth === 0) {
          return yield* Effect.fail(
            new ProjectEnvironmentDetectorError({
              cause: new Error('Ambiguous project language'),
              message: `Detected both JavaScript/TypeScript and Python indicators in ${dir}`,
              details: `Indicators: ${evidence.evidence.join(', ')}`,
              checkedPaths: dirs,
            })
          );
        }
        if (!ambiguous) ambiguous = { dir, details: `Indicators: ${evidence.evidence.join(', ')}` };
        continue;
      }

      if (evidence.strongJs)
        return { language: chooseJsLanguage(evidence), rootDir: dir, evidence } as const;
      if (evidence.strongPy)
        return { language: 'python' as const, rootDir: dir, evidence } as const;

      const weakCandidate = pickBestWeak(evidence, depth);
      if (weakCandidate && (!bestWeak || weakCandidate.score > bestWeak.score))
        bestWeak = weakCandidate;
    }

    if (bestWeak)
      return {
        language: bestWeak.language,
        rootDir: bestWeak.dir,
        evidence: bestWeak.evidence,
      } as const;

    if (ambiguous) {
      return yield* Effect.fail(
        new ProjectEnvironmentDetectorError({
          cause: new Error('Ambiguous project language'),
          message: `Detected both JavaScript/TypeScript and Python indicators in ${ambiguous.dir}`,
          details: ambiguous.details,
          checkedPaths: dirs,
        })
      );
    }

    return yield* Effect.fail(
      new ProjectEnvironmentDetectorError({
        cause: new Error('No project language detected'),
        message: `No recognizable JavaScript/TypeScript or Python project indicators found in ${cwd}`,
        checkedPaths: dirs,
      })
    );
  });

const detectJsPackageManager = (fs: FileSystem.FileSystem, cwd: string) =>
  Effect.gen(function* () {
    const readDirectoryOptional = makeReadDirectoryOptional(fs);
    const readPackageJson = makeReadPackageJson(fs);
    const dirs = getAncestors(cwd);

    for (const dir of dirs) {
      const files = yield* readDirectoryOptional(dir);
      const fileSet = new Set(files.map(f => f.toLowerCase()));

      if (fileSet.has('package.json')) {
        const pkg = yield* readPackageJson(dir);
        if (pkg && typeof pkg.packageManager === 'string') {
          const pm = parsePackageManagerField(pkg.packageManager);
          if (pm) return pm;
        }
      }

      if (fileSet.has('deno.json') || fileSet.has('deno.jsonc') || fileSet.has('deno.lock'))
        return 'deno' as const;

      for (const pm of ['pnpm', 'bun', 'yarn', 'npm'] as const) {
        if (JS_LOCK_FILES[pm].some(lf => fileSet.has(lf))) return pm;
      }

      if (fileSet.has('pnpm-workspace.yaml')) return 'pnpm' as const;
    }

    const userAgent = parseUserAgent(process.env.npm_config_user_agent);
    if (userAgent) return userAgent;

    return 'npm' as const;
  });

const detectPythonPackageManager = (fs: FileSystem.FileSystem, cwd: string) =>
  Effect.gen(function* () {
    const readDirectoryOptional = makeReadDirectoryOptional(fs);
    const readFileStringOptional = makeReadFileStringOptional(fs);
    const dirs = getAncestors(cwd);
    let fallback: PythonPackageManager | null = null;

    for (const dir of dirs) {
      const files = yield* readDirectoryOptional(dir);
      const fileSet = new Set(files.map(f => f.toLowerCase()));

      if (fileSet.has('uv.lock')) return 'uv' as const;

      if (fileSet.has('pyproject.toml')) {
        const content = yield* readFileStringOptional(path.join(dir, 'pyproject.toml'));
        if (content?.includes('[tool.uv]')) return 'uv' as const;
      }

      if (
        [
          'requirements.txt',
          'requirements-dev.txt',
          'requirements.in',
          'setup.py',
          'setup.cfg',
          'pipfile',
          'pipfile.lock',
          'poetry.lock',
          'environment.yml',
          'conda.yaml',
        ].some(f => fileSet.has(f))
      ) {
        fallback = 'pip';
      }
    }

    return fallback ?? 'pip';
  });

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ProjectEnvironmentDetector extends Effect.Service<ProjectEnvironmentDetector>()(
  'services/ProjectEnvironmentDetector',
  {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      const detectProjectEnvironment = (
        cwd: string
      ): Effect.Effect<ProjectEnvironment, ProjectEnvironmentDetectorError> =>
        Effect.gen(function* () {
          const detection = yield* detectLanguage(fs, cwd);

          if (detection.language === 'python') {
            const packageManager = yield* detectPythonPackageManager(fs, detection.rootDir);
            return {
              kind: 'python',
              language: 'python',
              packageManager,
              rootDir: detection.rootDir,
              evidence: detection.evidence.evidence,
            } satisfies ProjectEnvironment;
          }

          const packageManager = yield* detectJsPackageManager(fs, detection.rootDir);
          return {
            kind: 'js',
            language: detection.language,
            packageManager,
            rootDir: detection.rootDir,
            evidence: detection.evidence.evidence,
          } satisfies ProjectEnvironment;
        });

      return {
        detectProjectEnvironment,
        detectJsPackageManager: (cwd: string) => detectJsPackageManager(fs, cwd),
        detectPythonPackageManager: (cwd: string) => detectPythonPackageManager(fs, cwd),
      };
    }),
    dependencies: [BunFileSystem.layer],
  }
) {}
