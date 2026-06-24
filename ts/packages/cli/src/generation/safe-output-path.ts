import path from 'node:path';
import { Data, Effect } from 'effect';

export class SafeOutputPathError extends Data.TaggedError('generation/SafeOutputPathError')<{
  readonly filename: string;
  readonly outputDir: string;
  readonly resolvedPath: string;
  readonly message: string;
}> {}

/**
 * Joins a generated filename to the output directory, ensuring the result stays
 * within `outputDir`.
 *
 * Defense in depth against path traversal / arbitrary file write (CWE-22): even
 * though toolkit slugs are validated at decode time, this guarantees that any
 * filename derived from API-controlled data cannot escape the intended output
 * directory via `..` segments or absolute paths.
 *
 * Fails if the resolved path is not contained within `outputDir`.
 */
export function safeOutputPath(
  outputDir: string,
  filename: string
): Effect.Effect<string, SafeOutputPathError> {
  const resolvedDir = path.resolve(outputDir);
  const resolved = path.resolve(resolvedDir, filename);
  const relative = path.relative(resolvedDir, resolved);
  const isWithinOutputDir =
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));

  if (path.isAbsolute(filename) || !isWithinOutputDir) {
    return Effect.fail(
      new SafeOutputPathError({
        filename,
        outputDir,
        resolvedPath: resolved,
        message: `Refusing unsafe generated filename: ${filename} resolves to ${resolved}`,
      })
    );
  }

  return Effect.succeed(path.join(outputDir, filename));
}
