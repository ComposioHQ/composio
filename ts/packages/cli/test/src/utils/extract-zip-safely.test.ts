import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from '@effect/vitest';
import {
  extractZipSafely,
  isSymlinkZipEntry,
  UnsafeZipEntryError,
} from 'src/utils/extract-zip-safely';

const FIXTURES_DIR = path.join(__dirname, 'zip-fixtures');

const withTempDir = async (use: (dir: string) => Promise<void>): Promise<void> => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-zip-safely-'));
  try {
    await use(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

/**
 * `mode << 16` is how a zip stores the Unix mode in its external attributes.
 */
const externalAttributesFor = (mode: number): number => mode << 16;

describe('isSymlinkZipEntry', () => {
  it('detects a symbolic link', () => {
    expect(isSymlinkZipEntry(externalAttributesFor(0o120755))).toBe(true);
  });

  it('accepts a regular file', () => {
    expect(isSymlinkZipEntry(externalAttributesFor(0o100644))).toBe(false);
  });

  it('accepts a directory', () => {
    expect(isSymlinkZipEntry(externalAttributesFor(0o40755))).toBe(false);
  });

  it('accepts a Windows-authored entry that carries no Unix mode', () => {
    expect(isSymlinkZipEntry(0)).toBe(false);
  });
});

describe('extractZipSafely', () => {
  it('extracts an archive of regular files and directories', async () => {
    await withTempDir(async dir => {
      await extractZipSafely(path.join(FIXTURES_DIR, 'benign.zip'), dir);

      expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8').trim()).toBe('hello');
      expect(fs.readFileSync(path.join(dir, 'sub', 'b.txt'), 'utf8').trim()).toBe('world');
    });
  });

  it.each([
    ['symlink-absolute.zip', 'escape-abs'],
    ['symlink-relative.zip', 'escape-rel'],
  ])('refuses %s and plants nothing', async (fixture, entryName) => {
    await withTempDir(async dir => {
      await expect(extractZipSafely(path.join(FIXTURES_DIR, fixture), dir)).rejects.toThrow(
        UnsafeZipEntryError
      );

      // The guard runs before the entry is written, so the target stays empty.
      expect(fs.readdirSync(dir)).toEqual([]);
      expect(fs.existsSync(path.join(dir, entryName))).toBe(false);
    });
  });
});
