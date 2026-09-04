import { FileSystem, Path } from '@effect/platform';
import { Data, Effect, Scope } from 'effect';

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

type AtomicReplaceDirectoryOptions = {
  readonly sourcePath: string;
  readonly targetPath: string;
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

/**
 * Replaces a directory with a staged copy using two renames. The old directory
 * is restored when publishing the replacement fails. An abrupt process exit
 * between the renames can leave the target temporarily absent, with its prior
 * contents retained in a same-directory recovery path.
 */
export const atomicReplaceDirectory = ({
  sourcePath,
  targetPath,
}: AtomicReplaceDirectoryOptions): Effect.Effect<
  void,
  AtomicReplaceError,
  FileSystem.FileSystem | Path.Path | Scope.Scope
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const targetDirectory = path.dirname(targetPath);
    const stagingDirectory = yield* fs.makeTempDirectoryScoped({
      directory: targetDirectory,
      prefix: '.composio-atomic-replace-',
    });
    const targetName = path.basename(targetPath);
    const stagedPath = path.join(stagingDirectory, targetName);

    yield* fs.copy(sourcePath, stagedPath);

    if (!(yield* fs.exists(targetPath))) {
      yield* fs.rename(stagedPath, targetPath);
      return;
    }

    yield* Effect.uninterruptible(
      Effect.gen(function* () {
        const recoveryDirectory = yield* fs.makeTempDirectory({
          directory: targetDirectory,
          prefix: '.composio-atomic-recovery-',
        });
        const asidePath = path.join(recoveryDirectory, targetName);
        yield* fs
          .rename(targetPath, asidePath)
          .pipe(
            Effect.tapError(() =>
              fs.remove(recoveryDirectory, { recursive: true }).pipe(Effect.ignore)
            )
          );
        yield* fs.rename(stagedPath, targetPath).pipe(
          Effect.matchEffect({
            onSuccess: () =>
              fs
                .remove(recoveryDirectory, { recursive: true })
                .pipe(
                  Effect.catchAll(cause =>
                    Effect.logWarning(
                      `Published replacement at ${targetPath}; previous contents remain at ${asidePath}: ${String(cause)}`
                    )
                  )
                ),
            onFailure: publishCause =>
              fs.rename(asidePath, targetPath).pipe(
                Effect.matchEffect({
                  onSuccess: () =>
                    fs
                      .remove(recoveryDirectory, { recursive: true })
                      .pipe(Effect.zipRight(Effect.fail(publishCause))),
                  onFailure: restoreCause =>
                    Effect.fail(
                      new AtomicReplaceError({
                        targetPath,
                        message: `Failed to replace directory at ${targetPath}. Previous contents retained at ${asidePath}`,
                        cause: { publishCause, restoreCause },
                      })
                    ),
                })
              ),
          })
        );
      })
    );
  }).pipe(
    Effect.mapError(cause =>
      cause instanceof AtomicReplaceError
        ? cause
        : new AtomicReplaceError({
            targetPath,
            message: `Failed to replace directory at ${targetPath}`,
            cause,
          })
    )
  );
