/**
 * Tests for the filename containment primitive in `src/utils/safePath.ts`.
 *
 * Mirrors `TestSafeBasename` in `python/tests/test_safe_path.py`; the two SDKs
 * must reject the same malformed server-supplied filenames.
 */
import { describe, it, expect } from 'vitest';
import { MAX_FILENAME_BYTES, safeBasename } from '../../src/utils/safePath';
import { ValidationError } from '../../src/errors';

describe('safeBasename', () => {
  describe('accepts legitimate filenames', () => {
    it.each([
      ['report.pdf', 'report.pdf'],
      ['output/report.pdf', 'report.pdf'],
      ['output/subdir/data.json', 'data.json'],
      ['/absolute/report.pdf', 'report.pdf'],
      ['archive.tar.gz', 'archive.tar.gz'],
      ['.gitignore', '.gitignore'],
      ['a', 'a'],
      ['café.txt', 'café.txt'],
      ['😀.png', '😀.png'],
    ])('reduces %j to %j', (input, expected) => {
      expect(safeBasename(input)).toBe(expected);
    });

    it('ignores trailing separators, which name the same file', () => {
      expect(safeBasename('output/report.pdf/')).toBe('report.pdf');
    });

    it('strips a Windows-style path even when running on POSIX', () => {
      // `path.basename()` on POSIX would return this untouched, leaving
      // separators in what becomes a filename.
      expect(safeBasename('..\\..\\evil')).toBe('evil');
      expect(safeBasename('C:\\Users\\me\\report.pdf')).toBe('report.pdf');
    });

    it('trims surrounding whitespace', () => {
      expect(safeBasename(' report.pdf')).toBe('report.pdf');
    });

    it('accepts a filename at the byte limit', () => {
      const name = 'x'.repeat(MAX_FILENAME_BYTES);
      expect(safeBasename(name)).toBe(name);
    });
  });

  describe('rejects names that leave no usable basename', () => {
    // Each of these previously produced a save path equal to its own parent
    // directory (or the parent itself), surfacing as a raw EISDIR at write time.
    it.each(['', '.', '..', '...', 'sub/.', 'foo/..', './', '/', '//', '   ', 'sub/..'])(
      'rejects %j',
      input => {
        expect(() => safeBasename(input)).toThrow(ValidationError);
        expect(() => safeBasename(input)).toThrow(/leaves no usable basename/);
      }
    );

    // `trim()` strips Unicode whitespace, so these reduce to `.` or `..` only
    // after the raw segment has passed a naive dot check. The trimmed value is
    // what gets written, so it is what has to be validated.
    it.each([
      '\u00a0.\u00a0',
      '.\u00a0',
      '\u00a0.',
      '\u2007..\u2007',
      '\u2028.\u2029',
      '\ufeff..',
      'sub/\u00a0.\u00a0',
    ])('rejects whitespace-wrapped %j, which trims to a dot run', input => {
      expect(() => safeBasename(input)).toThrow(ValidationError);
    });

    it('does not let whitespace-wrapped dots through as a usable basename', () => {
      // Regression guard: these once returned '.' and '..', which made the save
      // path the download directory itself or its parent.
      for (const input of ['\u00a0.\u00a0', '\u2007..\u2007']) {
        let returned: string | undefined;
        try {
          returned = safeBasename(input);
        } catch {
          returned = undefined;
        }
        expect(returned).toBeUndefined();
      }
    });
  });

  describe('rejects unsafe names', () => {
    it.each(['report\u0000.pdf', 'report.pdf\u0000.exe'])('rejects NUL byte in %j', input => {
      expect(() => safeBasename(input)).toThrow(/NUL byte/);
    });

    it.each(['report?.txt', 'report.txt:payload', 'report<1>.txt', 'a|b.txt', 'tab\there.txt'])(
      'rejects Windows-reserved characters in %j on every platform',
      input => {
        expect(() => safeBasename(input)).toThrow(ValidationError);
      }
    );

    it.each(['report.txt.', 'report.txt '])('rejects trailing space or dot in %j', input => {
      expect(() => safeBasename(input)).toThrow(/ending in a space or dot/);
    });

    it.each(['NUL', 'nul', 'NUL.tar.gz', 'COM1.log.bak', 'COM¹.txt', 'LPT³.data', 'aux.txt'])(
      'rejects reserved device name %j with any extension',
      input => {
        expect(() => safeBasename(input)).toThrow(/reserved device name/);
      }
    );

    it('rejects a filename over the byte limit', () => {
      expect(() => safeBasename('x'.repeat(MAX_FILENAME_BYTES + 1))).toThrow(/longer than/);
    });

    it('measures the limit in bytes, not code units', () => {
      // 128 emoji are 128 UTF-16 code-unit pairs but 512 UTF-8 bytes; a
      // length check on `.length` would let this reach the filesystem.
      expect(() => safeBasename('😀'.repeat(128))).toThrow(/longer than/);
    });

    it('rejects a lone surrogate, which cannot be encoded as UTF-8', () => {
      // `TextEncoder` would silently substitute U+FFFD and write the file under
      // a name the response never specified.
      expect(() => safeBasename('report-\ud800.txt')).toThrow(/invalid Unicode/);
      expect(() => safeBasename('report-\udc00.txt')).toThrow(/invalid Unicode/);
    });
  });

  it('names the value in the error using the given label', () => {
    expect(() => safeBasename('..', 'mount path')).toThrow(/mount path/);
  });
});
