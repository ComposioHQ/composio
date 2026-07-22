import path from 'node:path';
import * as tempy from 'tempy';
import { describe, expect, layer, assert } from '@effect/vitest';
import { beforeAll, afterAll } from 'vitest';
import { Effect, Layer, Result, FileSystem } from 'effect';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import {
  ProjectEnvironmentDetector,
  ProjectEnvironmentDetectorError,
} from 'src/services/project-environment-detector';

const testLayer = Layer.provideMerge(ProjectEnvironmentDetector.Default, BunFileSystem.layer);

const writeFile = (fs: FileSystem.FileSystem, filePath: string, content: string) =>
  Effect.gen(function* () {
    const dir = path.dirname(filePath);
    yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.catch(() => Effect.void));
    yield* fs.writeFileString(filePath, content);
  });

describe('ProjectEnvironmentDetector', () => {
  let savedUserAgent: string | undefined;

  beforeAll(() => {
    savedUserAgent = process.env.npm_config_user_agent;
    delete process.env.npm_config_user_agent;
  });

  afterAll(() => {
    if (savedUserAgent !== undefined) {
      process.env.npm_config_user_agent = savedUserAgent;
    } else {
      delete process.env.npm_config_user_agent;
    }
  });

  describe('detectProjectEnvironment', () => {
    // -- TypeScript detection --

    layer(testLayer)('TypeScript detection', it => {
      it.effect('[Given] package.json + tsconfig.json [Then] detects typescript + npm', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const detector = yield* ProjectEnvironmentDetector;
          const cwd = tempy.temporaryDirectory();

          yield* writeFile(fs, path.join(cwd, 'package.json'), JSON.stringify({ name: 'test' }));
          yield* writeFile(fs, path.join(cwd, 'tsconfig.json'), '{}');

          const result = yield* detector.detectProjectEnvironment(cwd);

          expect(result.kind).toBe('js');
          expect(result.language).toBe('typescript');
          expect(result.packageManager).toBe('npm');
          expect(result.rootDir).toBe(cwd);
        })
      );

      it.effect(
        '[Given] pnpm-lock.yaml + package.json with packageManager:pnpm@ [Then] detects typescript + pnpm',
        () =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const detector = yield* ProjectEnvironmentDetector;
            const cwd = tempy.temporaryDirectory();

            yield* writeFile(
              fs,
              path.join(cwd, 'package.json'),
              JSON.stringify({
                name: 'test-mono',
                packageManager: 'pnpm@9.15.0',
                devDependencies: { typescript: '^5.0.0' },
              })
            );
            yield* writeFile(fs, path.join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 9');
            yield* writeFile(fs, path.join(cwd, 'tsconfig.json'), '{}');

            const result = yield* detector.detectProjectEnvironment(cwd);

            expect(result.kind).toBe('js');
            expect(result.language).toBe('typescript');
            expect(result.packageManager).toBe('pnpm');
          })
      );

      it.effect('[Given] bun.lockb [Then] detects js + bun', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const detector = yield* ProjectEnvironmentDetector;
          const cwd = tempy.temporaryDirectory();

          yield* writeFile(fs, path.join(cwd, 'package.json'), JSON.stringify({ name: 'test' }));
          yield* writeFile(fs, path.join(cwd, 'bun.lockb'), '');

          const result = yield* detector.detectProjectEnvironment(cwd);

          expect(result.kind).toBe('js');
          expect(result.packageManager).toBe('bun');
        })
      );

      it.effect('[Given] bun.lock (text format) [Then] detects bun', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const detector = yield* ProjectEnvironmentDetector;
          const cwd = tempy.temporaryDirectory();

          yield* writeFile(fs, path.join(cwd, 'package.json'), JSON.stringify({ name: 'test' }));
          yield* writeFile(fs, path.join(cwd, 'bun.lock'), '{}');

          const result = yield* detector.detectProjectEnvironment(cwd);

          expect(result.kind).toBe('js');
          expect(result.packageManager).toBe('bun');
        })
      );

      it.effect('[Given] package.json with typescript dep [Then] detects typescript', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const detector = yield* ProjectEnvironmentDetector;
          const cwd = tempy.temporaryDirectory();

          yield* writeFile(
            fs,
            path.join(cwd, 'package.json'),
            JSON.stringify({ name: 'test', devDependencies: { typescript: '^5.0.0' } })
          );

          const result = yield* detector.detectProjectEnvironment(cwd);

          expect(result.kind).toBe('js');
          expect(result.language).toBe('typescript');
        })
      );

      it.effect('[Given] monorepo root with pnpm-workspace.yaml [Then] detects pnpm', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const detector = yield* ProjectEnvironmentDetector;
          const cwd = tempy.temporaryDirectory();

          yield* writeFile(
            fs,
            path.join(cwd, 'package.json'),
            JSON.stringify({ name: 'monorepo' })
          );
          yield* writeFile(
            fs,
            path.join(cwd, 'pnpm-workspace.yaml'),
            "packages:\n  - 'packages/*'"
          );
          yield* writeFile(fs, path.join(cwd, 'tsconfig.json'), '{}');

          const result = yield* detector.detectProjectEnvironment(cwd);

          expect(result.kind).toBe('js');
          expect(result.packageManager).toBe('pnpm');
        })
      );
    });

    // -- Python detection --

    layer(testLayer)('Python detection', it => {
      it.effect('[Given] pyproject.toml with [tool.uv] + uv.lock [Then] detects python + uv', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const detector = yield* ProjectEnvironmentDetector;
          const cwd = tempy.temporaryDirectory();

          yield* writeFile(
            fs,
            path.join(cwd, 'pyproject.toml'),
            '[project]\nname = "test"\n\n[tool.uv]\ndev-dependencies = []'
          );
          yield* writeFile(fs, path.join(cwd, 'uv.lock'), 'version = 1');

          const result = yield* detector.detectProjectEnvironment(cwd);

          expect(result.kind).toBe('python');
          expect(result.language).toBe('python');
          expect(result.packageManager).toBe('uv');
        })
      );

      it.effect('[Given] requirements.txt only [Then] detects python + pip', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const detector = yield* ProjectEnvironmentDetector;
          const cwd = tempy.temporaryDirectory();

          yield* writeFile(fs, path.join(cwd, 'requirements.txt'), 'composio');

          const result = yield* detector.detectProjectEnvironment(cwd);

          expect(result.kind).toBe('python');
          expect(result.language).toBe('python');
          expect(result.packageManager).toBe('pip');
        })
      );

      it.effect('[Given] setup.py only [Then] detects python + pip', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const detector = yield* ProjectEnvironmentDetector;
          const cwd = tempy.temporaryDirectory();

          yield* writeFile(
            fs,
            path.join(cwd, 'setup.py'),
            'from setuptools import setup\nsetup(name="test")'
          );

          const result = yield* detector.detectProjectEnvironment(cwd);

          expect(result.kind).toBe('python');
          expect(result.packageManager).toBe('pip');
        })
      );
    });

    // -- Ambiguity --

    layer(testLayer)('Ambiguity handling', it => {
      it.effect(
        '[Given] both package.json + pyproject.toml at CWD [Then] fails with ambiguity error',
        () =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const detector = yield* ProjectEnvironmentDetector;
            const cwd = tempy.temporaryDirectory();

            yield* writeFile(fs, path.join(cwd, 'package.json'), JSON.stringify({ name: 'test' }));
            yield* writeFile(fs, path.join(cwd, 'pyproject.toml'), '[project]\nname = "test"');
            yield* writeFile(fs, path.join(cwd, 'requirements.txt'), 'composio');

            const result = yield* detector.detectProjectEnvironment(cwd).pipe(Effect.result);

            assert(Result.isFailure(result));
            expect(result.failure).toBeInstanceOf(ProjectEnvironmentDetectorError);
            expect(result.failure.message).toContain('both');
          })
      );
    });

    // -- Edge cases --

    layer(testLayer)('Edge cases', it => {
      it.effect('[Given] empty directory [Then] fails with no-detection error', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const detector = yield* ProjectEnvironmentDetector;
          const tempRoot = tempy.temporaryDirectory();
          const emptyDir = path.join(tempRoot, 'a', 'b', 'c');
          yield* fs.makeDirectory(emptyDir, { recursive: true });

          const result = yield* detector.detectProjectEnvironment(emptyDir).pipe(Effect.result);

          assert(Result.isFailure(result));
          expect(result.failure.message).toContain('No recognizable');
        })
      );

      it.effect('[Given] indicators at parent directory [Then] detects from parent', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const detector = yield* ProjectEnvironmentDetector;
          const parentDir = tempy.temporaryDirectory();
          const childDir = path.join(parentDir, 'subdir');
          yield* fs.makeDirectory(childDir, { recursive: true });

          yield* writeFile(
            fs,
            path.join(parentDir, 'package.json'),
            JSON.stringify({ name: 'parent', packageManager: 'pnpm@9.0.0' })
          );
          yield* writeFile(fs, path.join(parentDir, 'pnpm-lock.yaml'), '');
          yield* writeFile(fs, path.join(parentDir, 'tsconfig.json'), '{}');

          const result = yield* detector.detectProjectEnvironment(childDir);

          expect(result.kind).toBe('js');
          expect(result.packageManager).toBe('pnpm');
          expect(result.rootDir).toBe(parentDir);
        })
      );
    });
  });

  // -- detectJsPackageManager --

  describe('detectJsPackageManager', () => {
    layer(testLayer)('JS package manager detection', it => {
      it.effect('[Given] packageManager field in package.json [Then] uses that', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const detector = yield* ProjectEnvironmentDetector;
          const cwd = tempy.temporaryDirectory();

          yield* writeFile(
            fs,
            path.join(cwd, 'package.json'),
            JSON.stringify({ name: 'test', packageManager: 'yarn@4.0.0' })
          );

          const result = yield* detector.detectJsPackageManager(cwd);
          expect(result).toBe('yarn');
        })
      );

      it.effect('[Given] lock file present [Then] detects from lock file', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const detector = yield* ProjectEnvironmentDetector;
          const cwd = tempy.temporaryDirectory();

          yield* writeFile(fs, path.join(cwd, 'package.json'), JSON.stringify({ name: 'test' }));
          yield* writeFile(fs, path.join(cwd, 'yarn.lock'), '');

          const result = yield* detector.detectJsPackageManager(cwd);
          expect(result).toBe('yarn');
        })
      );

      it.effect('[Given] no lock file, no packageManager field [Then] defaults to npm', () =>
        Effect.gen(function* () {
          const detector = yield* ProjectEnvironmentDetector;
          const cwd = tempy.temporaryDirectory();

          const result = yield* detector.detectJsPackageManager(cwd);
          expect(result).toBe('npm');
        })
      );

      it.effect(
        '[Given] no lock file, no packageManager field, but npm_config_user_agent=pnpm [Then] detects pnpm',
        () =>
          Effect.gen(function* () {
            const detector = yield* ProjectEnvironmentDetector;
            const cwd = tempy.temporaryDirectory();

            process.env.npm_config_user_agent = 'pnpm/9.15.0 npm/? node/v20.11.0';
            try {
              const result = yield* detector.detectJsPackageManager(cwd);
              expect(result).toBe('pnpm');
            } finally {
              delete process.env.npm_config_user_agent;
            }
          })
      );

      it.effect(
        '[Given] no lock file, no packageManager field, but npm_config_user_agent=bun [Then] detects bun',
        () =>
          Effect.gen(function* () {
            const detector = yield* ProjectEnvironmentDetector;
            const cwd = tempy.temporaryDirectory();

            process.env.npm_config_user_agent = 'bun/1.1.0';
            try {
              const result = yield* detector.detectJsPackageManager(cwd);
              expect(result).toBe('bun');
            } finally {
              delete process.env.npm_config_user_agent;
            }
          })
      );
    });
  });

  // -- detectPythonPackageManager --

  describe('detectPythonPackageManager', () => {
    layer(testLayer)('Python package manager detection', it => {
      it.effect('[Given] uv.lock present [Then] detects uv', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const detector = yield* ProjectEnvironmentDetector;
          const cwd = tempy.temporaryDirectory();

          yield* writeFile(fs, path.join(cwd, 'uv.lock'), 'version = 1');

          const result = yield* detector.detectPythonPackageManager(cwd);
          expect(result).toBe('uv');
        })
      );

      it.effect('[Given] [tool.uv] in pyproject.toml [Then] detects uv', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const detector = yield* ProjectEnvironmentDetector;
          const cwd = tempy.temporaryDirectory();

          yield* writeFile(
            fs,
            path.join(cwd, 'pyproject.toml'),
            '[project]\nname = "test"\n\n[tool.uv]\ndev-dependencies = []'
          );

          const result = yield* detector.detectPythonPackageManager(cwd);
          expect(result).toBe('uv');
        })
      );

      it.effect('[Given] no uv indicators [Then] defaults to pip', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const detector = yield* ProjectEnvironmentDetector;
          const cwd = tempy.temporaryDirectory();

          yield* writeFile(fs, path.join(cwd, 'requirements.txt'), 'composio');

          const result = yield* detector.detectPythonPackageManager(cwd);
          expect(result).toBe('pip');
        })
      );
    });
  });
});
