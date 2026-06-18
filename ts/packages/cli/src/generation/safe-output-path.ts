import path from 'node:path';

/**
 * Joins a generated filename to the output directory, ensuring the result stays
 * within `outputDir`.
 *
 * Defense in depth against path traversal / arbitrary file write (CWE-22): even
 * though toolkit slugs are validated at decode time, this guarantees that any
 * filename derived from API-controlled data cannot escape the intended output
 * directory via `..` segments or absolute paths.
 *
 * @throws {Error} if the resolved path is not contained within `outputDir`.
 */
export function safeOutputPath(outputDir: string, filename: string): string {
  const resolvedDir = path.resolve(outputDir);
  const resolved = path.resolve(resolvedDir, filename);

  if (resolved !== resolvedDir && !resolved.startsWith(resolvedDir + path.sep)) {
    throw new Error(
      `Refusing to write file outside of output directory: ${filename} resolves to ${resolved}`
    );
  }

  return resolved;
}
