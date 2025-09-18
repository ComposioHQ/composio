import { describe, expect, layer } from '@effect/vitest';
import { BunFileSystem } from '@effect/platform-bun';
import { FileSystem } from '@effect/platform';
import { Effect, Layer } from 'effect';
import * as tempy from 'tempy';
import { JsPackageManagerDetector } from 'src/services/js-package-manager-detector';
import * as path from 'path';

describe('JsPackageManagerDetector', () => {
  const testLayer = Layer.provideMerge(JsPackageManagerDetector.Default, BunFileSystem.layer);

  layer(testLayer)(it => {
    it.scoped('should detect pnpm from lock file', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const detector = yield* JsPackageManagerDetector;
        const cwd = tempy.temporaryDirectory();

        yield* fs.writeFileString(path.join(cwd, 'pnpm-lock.yaml'), '');

        const result = yield* detector.detectJsPackageManager(cwd);

        expect(result).toEqual('pnpm');
      })
    );

    it.scoped('should detect bun from lock file', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const detector = yield* JsPackageManagerDetector;
        const cwd = tempy.temporaryDirectory();

        yield* fs.writeFileString(path.join(cwd, 'bun.lockb'), '');

        const result = yield* detector.detectJsPackageManager(cwd);

        expect(result).toEqual('bun');
      })
    );

    it.scoped('should detect yarn from lock file', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const detector = yield* JsPackageManagerDetector;
        const cwd = tempy.temporaryDirectory();

        yield* fs.writeFileString(path.join(cwd, 'yarn.lock'), '');

        const result = yield* detector.detectJsPackageManager(cwd);

        expect(result).toEqual('yarn');
      })
    );

    it.scoped('should detect npm from lock file', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const detector = yield* JsPackageManagerDetector;
        const cwd = tempy.temporaryDirectory();

        yield* fs.writeFileString(path.join(cwd, 'package-lock.json'), '');

        const result = yield* detector.detectJsPackageManager(cwd);

        expect(result).toEqual('npm');
      })
    );

    it.scoped('should detect from package.json if no lock file is present', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const detector = yield* JsPackageManagerDetector;
        const cwd = tempy.temporaryDirectory();

        yield* fs.writeFileString(
          path.join(cwd, 'package.json'),
          JSON.stringify({ packageManager: 'pnpm@8.6.0' })
        );

        const result = yield* detector.detectJsPackageManager(cwd);

        expect(result).toEqual('pnpm');
      })
    );

    it.scoped('should detect recursively from parent directory', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const detector = yield* JsPackageManagerDetector;
        const rootDir = tempy.temporaryDirectory();

        yield* fs.writeFileString(
          path.join(rootDir, 'package.json'),
          JSON.stringify({ packageManager: 'pnpm@10.16.0' })
        );

        const subDir = path.join(rootDir, 'subdir');
        yield* fs.makeDirectory(subDir);

        const result = yield* detector.detectJsPackageManager(subDir);

        expect(result).toEqual('pnpm');
      })
    );
  });
});
