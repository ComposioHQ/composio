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
  /** Move an in-use Windows executable aside before installing its replacement. */
  readonly backupPath?: string;
};

export const atomicReplaceFile = ({
  sourcePath,
  targetPath,
  mode,
  backupPath,
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
    if (backupPath === undefined || !(yield* fs.exists(targetPath))) {
      yield* fs.rename(stagedPath, targetPath);
      return;
    }

    // A loaded Windows executable cannot be overwritten. Keep its old image
    // until the next upgrade, when the process using it has exited.
    yield* fs.remove(backupPath, { force: true });
    yield* Effect.uninterruptible(
      fs
        .rename(targetPath, backupPath)
        .pipe(
          Effect.andThen(
            fs
              .rename(stagedPath, targetPath)
              .pipe(
                Effect.catch(cause =>
                  fs.rename(backupPath, targetPath).pipe(Effect.andThen(Effect.fail(cause)))
                )
              )
          )
        )
    );
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
