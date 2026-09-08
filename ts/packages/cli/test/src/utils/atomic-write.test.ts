import * as FileSystem from '@effect/platform/FileSystem';
import * as Path from '@effect/platform/Path';
import * as PlatformError from '@effect/platform/Error';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { describe, expect, layer } from '@effect/vitest';
import { Deferred, Effect, Fiber, Layer } from 'effect';
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

const collideWithTmpWrites = (
  fs: FileSystem.FileSystem,
  maxCollisions: number,
  onCollision: (path: string) => void
): FileSystem.FileSystem => {
  let collisions = 0;

  return new Proxy(fs, {
    get(target, property, receiver) {
      if (property !== 'writeFileString') {
        return Reflect.get(target, property, receiver);
      }

      return (path: string, contents: string, options?: FileSystem.WriteFileOptions) => {
        if (collisions >= maxCollisions || !path.includes('.composio-tmp.')) {
          return target.writeFileString(path, contents, options);
        }

        collisions += 1;
        onCollision(path);
        return target
          .writeFileString(path, 'pre-existing contents')
          .pipe(Effect.andThen(target.writeFileString(path, contents, options)));
      };
    },
  });
};

const delayAfterTmpWrite = (
  fs: FileSystem.FileSystem,
  onStaged: Effect.Effect<void>,
  release: Effect.Effect<void>
): FileSystem.FileSystem =>
  new Proxy(fs, {
    get(target, property, receiver) {
      if (property !== 'writeFileString') {
        return Reflect.get(target, property, receiver);
      }

      return (path: string, contents: string, options?: FileSystem.WriteFileOptions) =>
        target.writeFileString(path, contents, options).pipe(
          Effect.tap(() => onStaged),
          Effect.andThen(release)
        );
    },
  });

const failAfterTmpWrite = (fs: FileSystem.FileSystem): FileSystem.FileSystem =>
  new Proxy(fs, {
    get(target, property, receiver) {
      if (property !== 'writeFileString') {
        return Reflect.get(target, property, receiver);
      }

      return (path: string, contents: string, options?: FileSystem.WriteFileOptions) => {
        if (!path.includes('.composio-tmp.')) {
          return target.writeFileString(path, contents, options);
        }

        return target.writeFileString(path, contents, options).pipe(
          Effect.andThen(
            Effect.fail(
              new PlatformError.SystemError({
                reason: 'PermissionDenied',
                module: 'FileSystem',
                method: 'writeFileString',
                pathOrDescriptor: path,
              })
            )
          )
        );
      };
    },
  });

describe('atomicWritePrivateFileString', () => {
  layer(TestPlatform)(it => {
    it.scoped('retries an exclusive random staging path without touching a collision', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const target = path.join(directory, 'credentials.json');
        let collisionPath: string | undefined;
        const collidingFs = collideWithTmpWrites(fs, 1, collidedPath => {
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

    it.scoped('stops after bounded collisions without deleting foreign files', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const target = path.join(directory, 'credentials.json');
        const collisionPaths: string[] = [];
        const collidingFs = collideWithTmpWrites(fs, Number.POSITIVE_INFINITY, collisionPath => {
          collisionPaths.push(collisionPath);
        });

        const error = yield* atomicWritePrivateFileString({
          fs: collidingFs,
          target,
          contents: '{"api_key":"valid"}\n',
        }).pipe(Effect.flip);

        expect(error).toMatchObject({ _tag: 'SystemError', reason: 'AlreadyExists' });
        expect(collisionPaths).toHaveLength(5);
        expect(new Set(collisionPaths)).toHaveLength(5);
        expect(yield* fs.exists(target)).toBe(false);
        for (const collisionPath of collisionPaths) {
          expect(yield* fs.readFileString(collisionPath, 'utf8')).toBe('pre-existing contents');
        }
      })
    );

    it.scoped('cleans staging before honoring interruption', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const target = path.join(directory, 'credentials.json');
        yield* fs.writeFileString(target, '{"api_key":"old"}\n');
        yield* fs.chmod(target, 0o600);
        const staged = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const delayedFs = delayAfterTmpWrite(
          fs,
          Deferred.succeed(staged, undefined),
          Deferred.await(release)
        );
        const fiber = yield* atomicWritePrivateFileString({
          fs: delayedFs,
          target,
          contents: '{"api_key":"valid"}\n',
        }).pipe(Effect.fork);

        yield* Deferred.await(staged);
        const interruptFiber = yield* Fiber.interrupt(fiber).pipe(Effect.fork);
        yield* Effect.yieldNow();
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(interruptFiber);

        expect(yield* fs.readFileString(target, 'utf8')).toBe('{"api_key":"old"}\n');
        expect((yield* fs.stat(target)).mode & 0o777).toBe(0o600);
        expect(
          (yield* fs.readDirectory(directory)).filter(name => name.includes('.composio-tmp.'))
        ).toEqual([]);
      })
    );

    it.scoped('cleans a partially written staging file on non-collision failure', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const target = path.join(directory, 'credentials.json');
        yield* fs.writeFileString(target, '{"api_key":"old"}\n');
        yield* fs.chmod(target, 0o600);

        const error = yield* atomicWritePrivateFileString({
          fs: failAfterTmpWrite(fs),
          target,
          contents: '{"api_key":"new"}\n',
        }).pipe(Effect.flip);

        expect(error).toMatchObject({ _tag: 'SystemError', reason: 'PermissionDenied' });
        expect(yield* fs.readFileString(target, 'utf8')).toBe('{"api_key":"old"}\n');
        expect(
          (yield* fs.readDirectory(directory)).filter(name => name.includes('.composio-tmp.'))
        ).toEqual([]);
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
