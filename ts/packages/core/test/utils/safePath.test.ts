/**
 * Tests for the filename containment primitive in `src/utils/safePath.ts`.
 *
 * Covers the filename safety policy shared with `TestSafeBasename` in
 * `python/tests/test_safe_path.py`.
 */
import { describe, it, expect } from 'vitest';
import { MAX_FILENAME_BYTES, safeBasename, untrustedBasename } from '../../src/utils/safePath';
import { ValidationError } from '../../src/errors';

describe('untrustedBasename', () => {
  it.each([
    ['report.pdf', 'report.pdf'],
    ['C:report.txt', 'report.txt'],
    ['c:report.txt', 'report.txt'],
    ['C:', ''],
    ['output/report.pdf', 'report.pdf'],
    ['output/report.pdf/', 'report.pdf'],
    ['..\\..\\evil', 'evil'],
    ['C:\\Users\\me\\report.pdf', 'report.pdf'],
    ['', ''],
    ['/', ''],
    ['sub/.', '.'],
    ['foo/..', '..'],
  ])('reduces %j to %j without throwing', (input, expected) => {
    expect(untrustedBasename(input)).toBe(expected);
  });
});

describe('safeBasename', () => {
  describe('accepts legitimate filenames', () => {
    it.each([
      ['report.pdf', 'report.pdf'],
      ['C:report.txt', 'report.txt'],
      ['c:report.txt', 'report.txt'],
      ['\ufeffreport.txt', '\ufeffreport.txt'],
      ['report.txt\ufeff', 'report.txt\ufeff'],
      ['\u0085report.txt\u0085', 'report.txt'],
      ['output/report.pdf', 'report.pdf'],
      ['output/subdir/data.json', 'data.json'],
      ['/absolute/report.pdf', 'report.pdf'],
      ['output/report.pdf/', 'report.pdf'],
      ['..\\..\\evil', 'evil'],
      ['archive.tar.gz', 'archive.tar.gz'],
      ['.gitignore', '.gitignore'],
      [' report.pdf', 'report.pdf'],
      ['café.txt', 'café.txt'],
      ['😀.png', '😀.png'],
    ])('reduces %j to %j', (input, expected) => {
      expect(safeBasename(input)).toBe(expected);
    });

    it('accepts a filename at the byte limit', () => {
      const name = 'x'.repeat(MAX_FILENAME_BYTES);
      expect(safeBasename(name)).toBe(name);
    });
  });

  describe('rejects names that leave no usable basename', () => {
    // Each of these would make the save path equal its own directory or the
    // parent, surfacing as a raw EISDIR at write time.
    it.each(['', '.', '..', '...', 'sub/.', 'foo/..', './', '/', '//', '   ', 'C:'])(
      'rejects %j',
      input => {
        expect(() => safeBasename(input)).toThrow(ValidationError);
        expect(() => safeBasename(input)).toThrow(/leaves no usable basename/);
      }
    );

    // Python-compatible whitespace stripping would write these as `.` or `..`:
    // the usability check has to see the trimmed value, not the raw segment.
    it.each([
      '\u00a0.\u00a0',
      '.\u00a0',
      '\u00a0.',
      '\u2007..\u2007',
      '\u2028.\u2029',
      '\u0085..\u0085',
      '\u001c..\u001f',
    ])('rejects whitespace-wrapped %j, which trims to a dot run', input => {
      expect(() => safeBasename(input)).toThrow(/leaves no usable basename/);
    });
  });

  describe('rejects unsafe names', () => {
    it.each(['report\u0000.pdf', 'report.pdf\u0000.exe'])('rejects NUL byte in %j', input => {
      expect(() => safeBasename(input)).toThrow(/NUL byte/);
    });

    it.each([
      'report?.txt',
      'report.txt:payload',
      'report<1>.txt',
      'a|b.txt',
      'tab\there.txt',
      '\u001creport.txt\u001f',
      'output/C:report.txt',
    ])('rejects Windows-reserved characters in %j on every platform', input => {
      expect(() => safeBasename(input)).toThrow(/reserved by Windows/);
    });

    it.each(['report.txt.', 'report.txt ', '\ufeff..', 'report.\u00a0', 'report.\u0085'])(
      'rejects trailing space or dot in %j',
      input => {
        expect(() => safeBasename(input)).toThrow(/ending in a space or dot/);
      }
    );

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
      // Each emoji is two UTF-16 code units but four UTF-8 bytes.
      expect(safeBasename('😀'.repeat(32))).toBe('😀'.repeat(32));
      expect(() => safeBasename('😀'.repeat(33))).toThrow(/longer than/);
    });

    it('rejects a lone surrogate, which cannot be encoded as UTF-8', () => {
      expect(() => safeBasename('report-\ud800.txt')).toThrow(/invalid Unicode/);
      expect(() => safeBasename('report-\udc00.txt')).toThrow(/invalid Unicode/);
    });
  });

  it('names the value in the error using the given label', () => {
    expect(() => safeBasename('..', 'mount path')).toThrow(/mount path/);
  });
});
