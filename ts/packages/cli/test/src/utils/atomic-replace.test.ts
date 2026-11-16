import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { describe, expect, layer } from '@effect/vitest';
import { Effect, FileSystem, Layer, Option, Path } from 'effect';
import { AtomicReplaceError, atomicReplaceFile } from 'src/utils/atomic-replace';

const TestPlatform = Layer.mergeAll(BunFileSystem.layer, BunPath.layer);

describe('atomic replace', () => {
  layer(TestPlatform)(it => {
    it.effect('replaces an existing file without modifying its open inode', () =>
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
        const openContents = yield* oldTarget.readAlloc('old contents'.length);

        expect(yield* fs.readFileString(targetPath)).toBe('new contents');
        expect(after.dev).toBe(before.dev);
        expect(Option.getOrThrow(after.ino)).not.toBe(Option.getOrThrow(before.ino));
        expect(new TextDecoder().decode(Option.getOrThrow(openContents))).toBe('old contents');
        expect((yield* fs.readDirectory(directory)).sort()).toEqual(['source', 'target']);
      })
    );

    it.effect('creates an executable target when mode is provided', () =>
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

    it.effect('keeps the old executable beside the new one and replaces a previous backup', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const sourcePath = path.join(directory, 'source');
        const targetPath = path.join(directory, 'composio.exe');
        const backupPath = `${targetPath}.old`;
        yield* fs.writeFileString(sourcePath, 'new binary');
        yield* fs.writeFileString(targetPath, 'old binary');
        yield* fs.writeFileString(backupPath, 'previous backup');

        yield* Effect.scoped(atomicReplaceFile({ sourcePath, targetPath, backupPath }));

        expect(yield* fs.readFileString(targetPath)).toBe('new binary');
        expect(yield* fs.readFileString(backupPath)).toBe('old binary');
        expect((yield* fs.readDirectory(directory)).sort()).toEqual([
          'composio.exe',
          'composio.exe.old',
          'source',
        ]);
      })
    );

    it.effect('restores the old executable when placing its staged replacement fails', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const sourcePath = path.join(directory, 'source');
        const targetPath = path.join(directory, 'composio.exe');
        const backupPath = `${targetPath}.old`;
        yield* fs.writeFileString(sourcePath, 'new binary');
        yield* fs.writeFileString(targetPath, 'old binary');
        const failingFs = FileSystem.make({
          ...fs,
          rename: (from, to) => {
            return from.includes('.composio-atomic-replace-') && to === targetPath
              ? fs.rename(path.join(directory, 'missing'), to)
              : fs.rename(from, to);
          },
        });

        const error = yield* Effect.flip(
          Effect.scoped(atomicReplaceFile({ sourcePath, targetPath, backupPath })).pipe(
            Effect.provideService(FileSystem.FileSystem, failingFs)
          )
        );

        expect(error).toBeInstanceOf(AtomicReplaceError);
        expect(yield* fs.readFileString(targetPath)).toBe('old binary');
        expect(yield* fs.exists(backupPath)).toBe(false);
      })
    );

    it.effect('preserves the target and cleans staging when the source is missing', () =>
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
  });
});
