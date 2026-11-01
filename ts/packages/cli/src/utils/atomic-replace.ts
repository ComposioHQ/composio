import { Data, Effect, FileSystem, Path, Scope } from 'effect';

export class AtomicReplaceError extends Data.TaggedError('utils/AtomicReplaceError')<{
  readonly targetPath: string;
  readonly message: string;
  readonly cause: unknown;
}> {}

type AtomicReplaceFileOptions = {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly mode?: number;
};

export const atomicReplaceFile = ({
  sourcePath,
  targetPath,
  mode,
}: AtomicReplaceFileOptions): Effect.Effect<
  void,
  AtomicReplaceError,
  FileSystem.FileSystem | Path.Path | Scope.Scope
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const stagingDirectory = yield* fs.makeTempDirectoryScoped({
      directory: path.dirname(targetPath),
      prefix: '.composio-atomic-replace-',
    });
    const stagedPath = path.join(stagingDirectory, path.basename(targetPath));

    yield* fs.copyFile(sourcePath, stagedPath);
    if (mode !== undefined) {
      yield* fs.chmod(stagedPath, mode);
    }
    yield* fs.rename(stagedPath, targetPath);
  }).pipe(
    Effect.mapError(
      cause =>
        new AtomicReplaceError({
          targetPath,
          message: `Failed to replace file at ${targetPath}`,
          cause,
        })
    )
  );
