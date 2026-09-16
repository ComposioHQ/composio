import extractZip from 'extract-zip';

/**
 * Zip extraction that refuses symlink entries.
 *
 * `extract-zip` writes a symlink entry without validating its target
 * (CVE-2026-56876 / GHSA-jmr9-qjv8-65gv), and the advisory has no fixed
 * version. Sidecar archives never contain symlinks, so rejecting the entry type
 * removes the vector. See the matching helper in `@composio/cli` for why this
 * is a local workaround rather than an upstream fix, and when it can go; the
 * two are kept separate because this package must not be pulled into the CLI's
 * standalone companion bundles.
 */

// Unix mode lives in the high 16 bits of a zip entry's external attributes.
const UNIX_MODE_SHIFT = 16;
const FILE_TYPE_MASK = 0o170000;
const SYMLINK_FILE_TYPE = 0o120000;

export class UnsafeZipEntryError extends Error {
  constructor(readonly entryName: string) {
    super(
      `Refusing to extract archive: "${entryName}" is a symbolic link, which this CLI never ships.`
    );
    this.name = 'UnsafeZipEntryError';
  }
}

export const isSymlinkZipEntry = (externalFileAttributes: number): boolean =>
  ((externalFileAttributes >>> UNIX_MODE_SHIFT) & FILE_TYPE_MASK) === SYMLINK_FILE_TYPE;

export const extractZipSafely = (zipPath: string, dir: string): Promise<void> =>
  extractZip(zipPath, {
    dir,
    onEntry: entry => {
      if (isSymlinkZipEntry(entry.externalFileAttributes)) {
        throw new UnsafeZipEntryError(entry.fileName);
      }
    },
  });
