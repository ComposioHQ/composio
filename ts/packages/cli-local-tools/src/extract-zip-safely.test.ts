import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractZipSafely, isSymlinkZipEntry, UnsafeZipEntryError } from './extract-zip-safely';

const FIXTURES_DIR = path.join(__dirname, 'zip-fixtures');

const withTempDir = async (use: (dir: string) => Promise<void>): Promise<void> => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-tools-extract-'));
  try {
    await use(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe('isSymlinkZipEntry', () => {
  it.each([
    ['symbolic link', 0o120755, true],
    ['regular file', 0o100644, false],
    ['directory', 0o40755, false],
  ])('classifies a %s', (_label, mode, expected) => {
    expect(isSymlinkZipEntry(mode << 16)).toBe(expected);
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

  it.each(['symlink-absolute.zip', 'symlink-relative.zip'])(
    'refuses %s and plants nothing',
    async fixture => {
      await withTempDir(async dir => {
        await expect(extractZipSafely(path.join(FIXTURES_DIR, fixture), dir)).rejects.toThrow(
          UnsafeZipEntryError
        );

        expect(fs.readdirSync(dir)).toEqual([]);
      });
    }
  );
});
