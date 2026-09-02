import { FileSystem, Path } from '@effect/platform';
import * as PlatformError from '@effect/platform/Error';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { describe, expect, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { atomicWritePrivateFileString, ensurePrivateFileMode } from 'src/utils/atomic-write';

const TestPlatform = Layer.mergeAll(BunFileSystem.layer, BunPath.layer);

const failChmod = (fs: FileSystem.FileSystem, onAttempt: () => void): FileSystem.FileSystem =>
  new Proxy(fs, {
    get(target, property, receiver) {
      if (property !== 'chmod') {
        return Reflect.get(target, property, receiver);
      }

      return (path: string) => {
        onAttempt();
        return Effect.fail(
          new PlatformError.SystemError({
            reason: 'PermissionDenied',
            module: 'FileSystem',
            method: 'chmod',
            pathOrDescriptor: path,
          })
        );
      };
    },
  });

const collideWithFirstTmpWrite = (
  fs: FileSystem.FileSystem,
  onCollision: (path: string) => void
): FileSystem.FileSystem => {
  let collided = false;

  return new Proxy(fs, {
    get(target, property, receiver) {
      if (property !== 'writeFileString') {
        return Reflect.get(target, property, receiver);
      }

      return (path: string, contents: string, options?: FileSystem.WriteFileOptions) => {
        if (collided || !path.includes('.composio-tmp.')) {
          return target.writeFileString(path, contents, options);
        }

        collided = true;
        onCollision(path);
        return target
          .writeFileString(path, 'pre-existing contents')
          .pipe(Effect.andThen(target.writeFileString(path, contents, options)));
      };
    },
  });
};

describe('atomicWritePrivateFileString', () => {
  layer(TestPlatform)(it => {
    it.scoped('retries an exclusive random staging path without touching a collision', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const target = path.join(directory, 'credentials.json');
        let collisionPath: string | undefined;
        const collidingFs = collideWithFirstTmpWrite(fs, collidedPath => {
          collisionPath = collidedPath;
        });

        yield* atomicWritePrivateFileString({
          fs: collidingFs,
          target,
          contents: '{"api_key":"valid"}\n',
        });

        expect(collisionPath).toBeDefined();
        expect(yield* fs.readFileString(collisionPath!, 'utf8')).toBe('pre-existing contents');
        expect(yield* fs.readFileString(target, 'utf8')).toBe('{"api_key":"valid"}\n');
        expect((yield* fs.stat(target)).mode & 0o777).toBe(0o600);
      })
    );
  });
});

describe('ensurePrivateFileMode', () => {
  layer(TestPlatform)(it => {
    it.scoped('keeps valid contents readable when chmod fails', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const target = path.join(directory, 'credentials.json');
        const contents = '{"api_key":"valid"}\n';
        yield* fs.writeFileString(target, contents);
        yield* fs.chmod(target, 0o644);

        let chmodAttempts = 0;
        const failingFs = failChmod(fs, () => {
          chmodAttempts += 1;
        });
        const readContents = yield* ensurePrivateFileMode({ fs: failingFs, target }).pipe(
          Effect.andThen(failingFs.readFileString(target, 'utf8'))
        );

        expect(chmodAttempts).toBe(1);
        expect(readContents).toBe(contents);
        expect((yield* fs.stat(target)).mode & 0o777).toBe(0o644);
      })
    );

    it.scoped('does not call chmod for an already-private file', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const target = path.join(directory, 'credentials.json');
        yield* fs.writeFileString(target, '{"api_key":"valid"}\n');
        yield* fs.chmod(target, 0o600);

        let chmodAttempts = 0;
        const failingFs = failChmod(fs, () => {
          chmodAttempts += 1;
        });
        yield* ensurePrivateFileMode({ fs: failingFs, target });

        expect(chmodAttempts).toBe(0);
      })
    );
  });
});
