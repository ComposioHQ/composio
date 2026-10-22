import * as fs from 'node:fs';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { platform } from '../../src/platform/node';

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    closeSync: vi.fn(actual.closeSync),
    writeFileSync: vi.fn(actual.writeFileSync),
  };
});

const invertAsciiCase = (value: string): string =>
  [...value]
    .map(character => {
      const upper = character.toUpperCase();
      return character === upper ? character.toLowerCase() : upper;
    })
    .join('');

describe('node platform filesystem case detection', () => {
  it('detects the target filesystem for existing and not-yet-created paths', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-case-sensitivity-'));
    try {
      const probeDirectory = path.join(root, 'CaseProbe');
      mkdirSync(probeDirectory);
      const existingFile = path.join(probeDirectory, 'config.json');
      writeFileSync(existingFile, '{}');

      const caseVariantExists = existsSync(path.join(root, invertAsciiCase('CaseProbe')));
      const expected = !caseVariantExists;

      expect(platform.isFileSystemCaseSensitive(existingFile)).toBe(expected);
      expect(
        platform.isFileSystemCaseSensitive(
          path.join(probeDirectory, 'not-created-yet', 'config.json')
        )
      ).toBe(expected);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('node platform exclusive writes', () => {
  it('removes the file it created when the write fails', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-exclusive-write-'));
    try {
      const filePath = path.join(root, 'report.pdf');
      const actual = vi.mocked(fs.writeFileSync).getMockImplementation()!;
      // A disk that fills up mid-write: some bytes land, then the write fails.
      vi.mocked(fs.writeFileSync).mockImplementationOnce((file, data, options) => {
        actual(file, (data as Uint8Array).subarray(0, 1), options);
        throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
      });

      expect(() => platform.writeFileExclusiveSync(filePath, new Uint8Array([1, 2]))).toThrow(
        'no space left on device'
      );
      expect(existsSync(filePath)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('removes the file it created when closing it fails', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-exclusive-write-'));
    try {
      const filePath = path.join(root, 'report.pdf');
      const actual = vi.mocked(fs.closeSync).getMockImplementation()!;
      // Some filesystems report a deferred write error only on close.
      vi.mocked(fs.closeSync).mockImplementationOnce(fd => {
        actual(fd);
        throw Object.assign(new Error('disk quota exceeded'), { code: 'EDQUOT' });
      });

      expect(() => platform.writeFileExclusiveSync(filePath, new Uint8Array([1, 2]))).toThrow(
        'disk quota exceeded'
      );
      expect(existsSync(filePath)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('leaves an existing file untouched', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-exclusive-write-'));
    try {
      const filePath = path.join(root, 'report.pdf');
      writeFileSync(filePath, 'original');

      expect(() => platform.writeFileExclusiveSync(filePath, new Uint8Array([1]))).toThrow();
      expect(readFileSync(filePath, 'utf8')).toBe('original');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
