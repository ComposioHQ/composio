import { FileSystem, Path } from '@effect/platform';
import * as PlatformError from '@effect/platform/Error';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { describe, expect, layer } from '@effect/vitest';
import { Effect, Layer, Option } from 'effect';
import {
  AtomicReplaceError,
  atomicReplaceDirectory,
  atomicReplaceFile,
} from 'src/utils/atomic-replace';

const TestPlatform = Layer.mergeAll(BunFileSystem.layer, BunPath.layer);

const failDirectoryPublish = (targetPath: string, failRestore = false) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.map(
      FileSystem.FileSystem,
      fs =>
        new Proxy(fs, {
          get(target, property, receiver) {
            if (property !== 'rename') {
              return Reflect.get(target, property, receiver);
            }

            return (oldPath: string, newPath: string) => {
              const shouldFail =
                newPath === targetPath &&
                (oldPath.includes('.composio-atomic-replace-') ||
                  (failRestore && oldPath.includes('.composio-atomic-recovery-')));
              return shouldFail
                ? Effect.fail(
                    new PlatformError.SystemError({
                      reason: 'Busy',
                      module: 'FileSystem',
                      method: 'rename',
                      pathOrDescriptor: newPath,
                    })
                  )
                : target.rename(oldPath, newPath);
            };
          },
        })
    )
  ).pipe(Layer.provide(BunFileSystem.layer));

const failDirectoryCleanup = () =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.map(
      FileSystem.FileSystem,
      fs =>
        new Proxy(fs, {
          get(target, property, receiver) {
            if (property !== 'remove') {
              return Reflect.get(target, property, receiver);
            }

            return (path: string, options?: FileSystem.RemoveOptions) =>
              path.includes('.composio-atomic-recovery-')
                ? Effect.fail(
                    new PlatformError.SystemError({
                      reason: 'Busy',
                      module: 'FileSystem',
                      method: 'remove',
                      pathOrDescriptor: path,
                    })
                  )
                : target.remove(path, options);
          },
        })
    )
  ).pipe(Layer.provide(BunFileSystem.layer));

const makeDirectoryFixture = (withTarget = true) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped();
    const sourcePath = path.join(directory, 'source');
    const targetPath = path.join(directory, 'target');
    yield* fs.makeDirectory(sourcePath);
    yield* fs.writeFileString(path.join(sourcePath, 'new.txt'), 'new contents');
    if (withTarget) {
      yield* fs.makeDirectory(targetPath);
      yield* fs.writeFileString(path.join(targetPath, 'old.txt'), 'old contents');
    }
    return { directory, fs, path, sourcePath, targetPath };
  });

describe('atomic replace', () => {
  layer(TestPlatform)(it => {
    it.scoped('replaces an existing file without modifying its open inode', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const sourcePath = path.join(directory, 'source');
        const targetPath = path.join(directory, 'target');
        yield* fs.writeFileString(sourcePath, 'new contents');
        yield* fs.writeFileString(targetPath, 'old contents');

        const before = yield* fs.stat(targetPath);
        const oldTarget = yield* fs.open(targetPath);
        yield* Effect.scoped(atomicReplaceFile({ sourcePath, targetPath }));
        const after = yield* fs.stat(targetPath);
        const openContents = yield* oldTarget.readAlloc(FileSystem.Size('old contents'.length));

        expect(yield* fs.readFileString(targetPath)).toBe('new contents');
        expect(after.dev).toBe(before.dev);
        expect(Option.getOrThrow(after.ino)).not.toBe(Option.getOrThrow(before.ino));
        expect(new TextDecoder().decode(Option.getOrThrow(openContents))).toBe('old contents');
        expect((yield* fs.readDirectory(directory)).sort()).toEqual(['source', 'target']);
      })
    );

    it.scoped('creates an executable target when mode is provided', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const sourcePath = path.join(directory, 'source');
        const targetPath = path.join(directory, 'target');
        yield* fs.writeFileString(sourcePath, 'binary');

        yield* Effect.scoped(atomicReplaceFile({ sourcePath, targetPath, mode: 0o755 }));

        expect(yield* fs.readFileString(targetPath)).toBe('binary');
        expect((yield* fs.stat(targetPath)).mode & 0o777).toBe(0o755);
        expect((yield* fs.readDirectory(directory)).sort()).toEqual(['source', 'target']);
      })
    );

    it.scoped('preserves the target and cleans staging when the source is missing', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const sourcePath = path.join(directory, 'missing');
        const targetPath = path.join(directory, 'target');
        yield* fs.writeFileString(targetPath, 'old contents');

        const error = yield* Effect.flip(
          Effect.scoped(atomicReplaceFile({ sourcePath, targetPath }))
        );

        expect(error).toBeInstanceOf(AtomicReplaceError);
        expect(error.targetPath).toBe(targetPath);
        expect(error.cause).toBeDefined();
        expect(yield* fs.readFileString(targetPath)).toBe('old contents');
        expect(yield* fs.readDirectory(directory)).toEqual(['target']);
      })
    );

    it.scoped('replaces an existing non-empty directory without leaving residue', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const sourcePath = path.join(directory, 'source');
        const targetPath = path.join(directory, 'target');
        yield* fs.makeDirectory(path.join(sourcePath, 'nested'), { recursive: true });
        yield* fs.writeFileString(path.join(sourcePath, 'nested', 'new.txt'), 'new contents');
        yield* fs.makeDirectory(targetPath);
        yield* fs.writeFileString(path.join(targetPath, 'old.txt'), 'old contents');

        yield* Effect.scoped(atomicReplaceDirectory({ sourcePath, targetPath }));

        expect(yield* fs.readFileString(path.join(targetPath, 'nested', 'new.txt'))).toBe(
          'new contents'
        );
        expect(yield* fs.exists(path.join(targetPath, 'old.txt'))).toBe(false);
        expect((yield* fs.readDirectory(directory)).sort()).toEqual(['source', 'target']);
      })
    );

    it.scoped('creates a directory target that does not exist', () =>
      Effect.gen(function* () {
        const { directory, fs, path, sourcePath, targetPath } = yield* makeDirectoryFixture(false);

        yield* Effect.scoped(atomicReplaceDirectory({ sourcePath, targetPath }));

        expect(yield* fs.readFileString(path.join(targetPath, 'new.txt'))).toBe('new contents');
        expect((yield* fs.readDirectory(directory)).sort()).toEqual(['source', 'target']);
      })
    );

    it.scoped('restores the previous directory when publishing fails', () =>
      Effect.gen(function* () {
        const { directory, fs, path, sourcePath, targetPath } = yield* makeDirectoryFixture();

        const error = yield* Effect.flip(
          Effect.scoped(atomicReplaceDirectory({ sourcePath, targetPath })).pipe(
            Effect.provide(failDirectoryPublish(targetPath))
          )
        );

        expect(error).toBeInstanceOf(AtomicReplaceError);
        expect(yield* fs.readFileString(path.join(targetPath, 'old.txt'))).toBe('old contents');
        expect((yield* fs.readDirectory(directory)).sort()).toEqual(['source', 'target']);
      })
    );

    it.scoped('keeps the published directory when old-content cleanup fails', () =>
      Effect.gen(function* () {
        const { directory, fs, path, sourcePath, targetPath } = yield* makeDirectoryFixture();

        yield* Effect.scoped(atomicReplaceDirectory({ sourcePath, targetPath })).pipe(
          Effect.provide(failDirectoryCleanup())
        );

        const recoveryDirectory = (yield* fs.readDirectory(directory)).find(entry =>
          entry.startsWith('.composio-atomic-recovery-')
        );
        expect(yield* fs.readFileString(path.join(targetPath, 'new.txt'))).toBe('new contents');
        expect(recoveryDirectory).toBeDefined();
        expect(
          yield* fs.readFileString(path.join(directory, recoveryDirectory!, 'target', 'old.txt'))
        ).toBe('old contents');
      })
    );

    it.scoped('retains the previous directory when publishing and restoration fail', () =>
      Effect.gen(function* () {
        const { directory, fs, path, sourcePath, targetPath } = yield* makeDirectoryFixture();

        const error = yield* Effect.flip(
          Effect.scoped(atomicReplaceDirectory({ sourcePath, targetPath })).pipe(
            Effect.provide(failDirectoryPublish(targetPath, true))
          )
        );
        const recoveryDirectory = (yield* fs.readDirectory(directory)).find(entry =>
          entry.startsWith('.composio-atomic-recovery-')
        );

        expect(error).toBeInstanceOf(AtomicReplaceError);
        expect(recoveryDirectory).toBeDefined();
        expect(error.message).toContain('Previous contents retained at');
        expect(
          yield* fs.readFileString(path.join(directory, recoveryDirectory!, 'target', 'old.txt'))
        ).toBe('old contents');
      })
    );
  });
});
