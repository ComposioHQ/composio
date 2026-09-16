import extractZip from 'extract-zip';

/**
 * Zip extraction that refuses symlink entries.
 *
 * `extract-zip` writes a symlink entry without validating its target
 * (CVE-2026-56876 / GHSA-jmr9-qjv8-65gv). It does block writes that *traverse* a
 * symlink, so an archive cannot plant a file outside the extraction directory,
 * but the dangling symlink itself is created — pointing anywhere, including an
 * absolute path. Anything that later reads or copies the extracted tree can be
 * walked out of it. The advisory has no fixed version: 2.0.1 is the newest
 * release, and GitHub records `first_patched_version` as null.
 *
 * No archive this CLI extracts — release binaries, companion assets, skills —
 * legitimately contains a symlink, so rejecting the entry type outright removes
 * the vector without narrowing what a valid archive may hold. The check runs
 * before the entry is written, so a rejected archive plants nothing.
 *
 * This is deliberately a local workaround rather than an upstream fix. Refusing
 * every symlink suits an application whose archives never carry one, but it
 * would break a general-purpose library, where the correct fix is to validate
 * that a link's resolved target stays inside the extraction root. That fix is
 * already proposed upstream several times over — max-mapper/extract-zip#158,
 * #160 and #161 — and none of them has moved: the repository's last commit was
 * August 2021, and the issue asking whether a patched release is planned
 * (max-mapper/extract-zip#159) has drawn replies only from other stranded
 * consumers. Drop this helper once a release actually carries the fix.
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

/**
 * Whether a zip entry's external attributes describe a symbolic link.
 *
 * Archives written on Windows leave the Unix mode bits empty, which reads as a
 * regular file — the correct answer, since such an archive has no symlinks.
 */
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
