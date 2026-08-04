import { FileSystem } from '@effect/platform';
import { Effect, Random } from 'effect';

/**
 * Writes `content` to a sibling temp file and renames it over `filePath`.
 *
 * Renaming within a filesystem is atomic, so a reader — another CLI process,
 * or the next run after this one is killed mid-write — sees either the old
 * file or the new one, never a truncated mix. The temp file is a sibling
 * rather than a tmpdir entry so both paths stay on the same volume, where
 * rename cannot degrade into a copy.
 */
export const writeFileAtomic = (filePath: string, content: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Concurrent writers must not share a temp path, or one would rename the
    // other's half-written file into place.
    const suffix = yield* Random.nextIntBetween(0x100000, 0xffffff);
    const tempPath = `${filePath}.tmp-${suffix.toString(16)}`;

    yield* fs.writeFileString(tempPath, content);
    yield* fs
      .rename(tempPath, filePath)
      .pipe(Effect.onError(() => fs.remove(tempPath).pipe(Effect.ignore)));
  });
