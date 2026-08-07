/**
 * Atomic file replacement shared by every tmp-write→rename site in the CLI
 * (shell rc rewrites, the tool-permissions cache, analytics state).
 *
 * The tmp file lives next to the target so the final rename(2) stays on one
 * filesystem and is atomic: readers observe either the old or the new
 * contents, never a partial write. The tmp name embeds the pid so concurrent
 * CLI processes writing the same target never share (and clobber) one tmp
 * file. On any failure — including a failure of the initial write itself,
 * e.g. ENOSPC mid-write — the tmp file is removed best-effort before the
 * original error propagates, so no tmp litter is left next to the target.
 */

import type { FileSystem } from '@effect/platform';
import type { PlatformError } from '@effect/platform/Error';
import { Effect, Option } from 'effect';

export const atomicTmpPath = (target: string): string => `${target}.composio-tmp.${process.pid}`;

export const atomicWriteFileString = (params: {
  readonly fs: FileSystem.FileSystem;
  readonly target: string;
  readonly contents: string;
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
    const tmpPath = atomicTmpPath(target);

    const writeAndPromote = Effect.gen(function* () {
      yield* Option.match(preservedMode, {
        onNone: () => fs.writeFileString(tmpPath, contents),
        onSome: mode => fs.writeFileString(tmpPath, contents, { mode }),
      });
      yield* Option.match(preservedMode, {
        onNone: () => Effect.void,
        onSome: mode => fs.chmod(tmpPath, mode),
      });
      yield* fs.rename(tmpPath, target);
    });

    yield* writeAndPromote.pipe(
      Effect.onError(() => fs.remove(tmpPath, { force: true }).pipe(Effect.ignore))
    );
  });
