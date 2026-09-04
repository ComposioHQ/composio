/**
 * Atomic file replacement shared by every tmp-write→rename site in the CLI
 * (shell rc rewrites, the tool-permissions cache, analytics state).
 *
 * The tmp file lives next to the target so the final rename(2) stays on one
 * filesystem and is atomic: readers observe either the old or the new
 * contents, never a partial write. The tmp name contains a random UUID and is
 * created exclusively so concurrent or hostile processes cannot share,
 * replace, or redirect it. On any failure — including a failure of the initial write itself,
 * e.g. ENOSPC mid-write — the tmp file is removed best-effort before the
 * original error propagates, so no tmp litter is left next to the target.
 */

import type { FileSystem } from '@effect/platform';
import type { PlatformError } from '@effect/platform/Error';
import { Effect, Either, Option, Predicate } from 'effect';

const MAX_ATOMIC_WRITE_ATTEMPTS = 5;

export const atomicTmpPath = (target: string): string =>
  `${target}.composio-tmp.${crypto.randomUUID()}`;

export const atomicWriteFileString = (params: {
  readonly fs: FileSystem.FileSystem;
  readonly target: string;
  readonly contents: string;
  /** Create the replacement with this exact mode, including over an existing target. */
  readonly mode?: number;
  /**
   * Preserve an existing target's file mode across the replacement: the tmp
   * copy is created with the target's mode from the start so private contents
   * never sit in a default-mode, world-readable tmp file. open(2) masks the
   * requested mode with the process umask (only ever clearing bits), so a
   * chmod still follows to pin the exact mode. When the target does not
   * exist (or `preserveMode` is false) the tmp is created with default mode.
   */
  readonly preserveMode?: boolean;
}): Effect.Effect<void, PlatformError> =>
  Effect.gen(function* () {
    const { fs, target, contents } = params;
    const preservedMode = params.preserveMode
      ? Option.map(yield* fs.stat(target).pipe(Effect.option), info => info.mode & 0o7777)
      : Option.none<number>();
    const targetMode = Option.fromNullable(params.mode).pipe(Option.orElse(() => preservedMode));
    const stage = (attempt: number): Effect.Effect<string, PlatformError> =>
      Effect.gen(function* () {
        const tmpPath = atomicTmpPath(target);
        const created = yield* Option.match(targetMode, {
          onNone: () => fs.writeFileString(tmpPath, contents, { flag: 'wx' }),
          onSome: mode => fs.writeFileString(tmpPath, contents, { flag: 'wx', mode }),
        }).pipe(Effect.either);

        if (Either.isLeft(created)) {
          const isCollision =
            Predicate.isTagged('SystemError')(created.left) &&
            created.left.reason === 'AlreadyExists';
          if (isCollision && attempt < MAX_ATOMIC_WRITE_ATTEMPTS) {
            return yield* stage(attempt + 1);
          }
          if (!isCollision) {
            yield* fs.remove(tmpPath, { force: true }).pipe(Effect.ignore);
          }
          return yield* Effect.fail(created.left);
        }

        return tmpPath;
      });

    // Effect keeps acquisition and release uninterruptible. The promotion stays
    // interruptible, but cancellation cannot occur between staging and the
    // cleanup responsibility being registered.
    yield* Effect.acquireUseRelease(
      stage(1),
      tmpPath =>
        Effect.gen(function* () {
          yield* Option.match(targetMode, {
            onNone: () => Effect.void,
            onSome: mode => fs.chmod(tmpPath, mode),
          });
          yield* fs.rename(tmpPath, target);
        }),
      tmpPath => fs.remove(tmpPath, { force: true }).pipe(Effect.ignore)
    );
  });

export const atomicWritePrivateFileString = (params: {
  readonly fs: FileSystem.FileSystem;
  readonly target: string;
  readonly contents: string;
}): Effect.Effect<void, PlatformError> => atomicWriteFileString({ ...params, mode: 0o600 });

/**
 * Tighten a credential-bearing file written by an older CLI before reading it.
 * This repairs existing files because a write mode only applies when creating
 * a new file and cannot remove permissions from an existing one.
 */
export const ensurePrivateFileMode = (params: {
  readonly fs: FileSystem.FileSystem;
  readonly target: string;
}): Effect.Effect<void> =>
  Effect.gen(function* () {
    const fileInfo = yield* params.fs.stat(params.target).pipe(
      Effect.tapError(error =>
        Effect.logWarning(
          `Could not inspect permissions for credential file at ${params.target}; continuing with the read: ${String(error)}`
        )
      ),
      Effect.option
    );

    if (Option.isNone(fileInfo) || (fileInfo.value.mode & 0o077) === 0) return;

    yield* params.fs
      .chmod(params.target, 0o600)
      .pipe(
        Effect.catchAll(error =>
          Effect.logWarning(
            `Could not tighten permissions for credential file at ${params.target}; continuing with the read: ${String(error)}`
          )
        )
      );
  });
