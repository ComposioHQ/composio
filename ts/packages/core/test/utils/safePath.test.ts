/**
 * Tests for the filename containment primitive in `src/utils/safePath.ts`.
 *
 * Covers the filename safety policy shared with `TestSafeBasename` in
 * `python/tests/test_safe_path.py`.
 */
import { describe, it, expect } from 'vitest';
import { MAX_FILENAME_BYTES, safeBasename, untrustedBasename } from '../../src/utils/safePath';
import { ValidationError } from '../../src/errors';

/** Bytes a changed name gains: `-` and 16 hex digits of the original's digest. */
const TAG_BYTES = 17;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches `stem`, the digest tag of a changed name, then `extension`. */
const tagged = (stem: string, extension: string = ''): RegExp =>
  new RegExp(`^${escapeRegExp(stem)}-[0-9a-f]{16}${escapeRegExp(extension)}$`, 'u');

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
      ['\u001creport.txt\u001f', 'report.txt'],
      ['output/report.pdf', 'report.pdf'],
      ['output/subdir/data.json', 'data.json'],
      ['/absolute/report.pdf', 'report.pdf'],
      ['output/report.pdf/', 'report.pdf'],
      ['..\\..\\evil', 'evil'],
      ['archive.tar.gz', 'archive.tar.gz'],
      ['.gitignore', '.gitignore'],
      [' report.pdf', 'report.pdf'],
      ['report.pdf ', 'report.pdf'],
      ['café.txt', 'café.txt'],
      ['😀.png', '😀.png'],
    ])('reduces %j to %j', (input, expected) => {
      expect(safeBasename(input)).toBe(expected);
    });

    it('keeps a filename at the byte limit unchanged', () => {
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

  describe('rejects names that cannot be written', () => {
    it.each(['report\u0000.pdf', 'report.pdf\u0000.exe'])('rejects NUL byte in %j', input => {
      expect(() => safeBasename(input)).toThrow(/NUL byte/);
    });

    it('rejects a lone surrogate, which cannot be encoded as UTF-8', () => {
      expect(() => safeBasename('report-\ud800.txt')).toThrow(/invalid Unicode/);
      expect(() => safeBasename('report-\udc00.txt')).toThrow(/invalid Unicode/);
    });

    it.each(['. .', '.. ', ' . . '])(
      'rejects %j, which is a dot run once Windows trims it',
      input => {
        expect(() => safeBasename(input)).toThrow(/leaves no usable basename/);
      }
    );
  });

  describe('makes unportable names portable on every platform', () => {
    it.each([
      ['report_2026-09-29T10:30:00.csv', 'report_2026-09-29T10_30_00', '.csv'],
      ['What is this?.png', 'What is this_', '.png'],
      ['invoice "final".pdf', 'invoice _final_', '.pdf'],
      ['report.txt:payload', 'report', '.txt_payload'],
      ['report<1>.txt', 'report_1_', '.txt'],
      ['a|b*.txt', 'a_b_', '.txt'],
      ['tab\there.txt', 'tab_here', '.txt'],
      ['output/C:report.txt', 'C_report', '.txt'],
    ])('replaces reserved characters in %j', (input, stem, extension) => {
      expect(safeBasename(input)).toMatch(tagged(stem, extension));
    });

    it.each([
      ['report.txt.', 'report', '.txt'],
      ['report. .', 'report', ''],
      ['report.\u00a0', 'report', ''],
      ['report.\u0085', 'report', ''],
      ['\ufeff..', '\ufeff', ''],
    ])('drops trailing spaces and dots from %j', (input, stem, extension) => {
      expect(safeBasename(input)).toMatch(tagged(stem, extension));
    });

    it.each([
      ['NUL', '_NUL', ''],
      ['nul', '_nul', ''],
      ['NUL.tar.gz', '_NUL.tar', '.gz'],
      ['COM1.log.bak', '_COM1.log', '.bak'],
      ['COM¹.txt', '_COM¹', '.txt'],
      ['LPT³.data', '_LPT³', '.data'],
      ['aux.txt', '_aux', '.txt'],
      ['CON .txt', '_CON ', '.txt'],
      ['COM1:.txt', 'COM1_', '.txt'],
    ])('prefixes reserved device name %j', (input, stem, extension) => {
      expect(safeBasename(input)).toMatch(tagged(stem, extension));
    });

    it('prefixes a device name exposed by truncation or trailing-space removal', () => {
      // Truncation keeps `NUL` plus spaces before `.txt`, and Windows ignores
      // the spaces, so the checked name must be the fitted one.
      expect(safeBasename(`NUL${' '.repeat(200)}x.txt`)).toMatch(
        tagged(`_NUL${' '.repeat(MAX_FILENAME_BYTES - TAG_BYTES - 8)}`, '.txt')
      );
      expect(safeBasename(`CON${' '.repeat(200)}x`)).toMatch(tagged('_CON'));
    });

    it('truncates a long name to the byte limit and keeps its extension', () => {
      const result = safeBasename(`${'x'.repeat(200)}.pdf`);
      expect(result).toMatch(tagged('x'.repeat(MAX_FILENAME_BYTES - TAG_BYTES - 4), '.pdf'));
      expect(result).toHaveLength(MAX_FILENAME_BYTES);
    });

    it('truncates by whole code points, measured in bytes', () => {
      // Each CJK character is one UTF-16 code unit but three UTF-8 bytes, and
      // each emoji is two code units but four bytes.
      const cjk = safeBasename(`${'請'.repeat(70)}.pdf`);
      expect(cjk).toMatch(tagged('請'.repeat(35), '.pdf'));
      expect(new TextEncoder().encode(cjk).length).toBeLessThanOrEqual(MAX_FILENAME_BYTES);
      expect(safeBasename('😀'.repeat(33))).toMatch(tagged('😀'.repeat(27)));
    });

    it('truncates an over-long extension with the rest of the name', () => {
      const result = safeBasename(`report.${'x'.repeat(200)}`);
      expect(result).toMatch(tagged(`report.${'x'.repeat(MAX_FILENAME_BYTES - TAG_BYTES - 7)}`));
    });

    it('drops a trailing dot exposed by truncation', () => {
      const name = `${'x'.repeat(MAX_FILENAME_BYTES - 1)}.${'y'.repeat(40)}`;
      expect(safeBasename(name)).toMatch(tagged('x'.repeat(MAX_FILENAME_BYTES - TAG_BYTES)));
    });
  });

  describe('keeps names that portability changed from colliding', () => {
    // `TestSafeBasename` in the Python SDK asserts the same vectors, so both
    // SDKs write a given server name to the same file.
    it.each([
      ['report?.png', 'report_-05fcb95aa5b918e9.png'],
      ['report*.png', 'report_-aa921bdab2b33292.png'],
      ['report_2026-09-29T10:30:00.csv', 'report_2026-09-29T10_30_00-d7211bb25cb815fe.csv'],
      ['NUL.txt', '_NUL-d0848f78ce05ded6.txt'],
    ])('tags %j with a digest of the original name', (input, expected) => {
      expect(safeBasename(input)).toBe(expected);
    });

    it('writes distinct names that normalize alike to distinct files', () => {
      const names = ['report?.png', 'report*.png', 'report:.png', 'report_.png'];
      expect(new Set(names.map(name => safeBasename(name))).size).toBe(names.length);
    });

    it('writes distinct long names that share a truncated prefix to distinct files', () => {
      const prefix = 'a'.repeat(200);
      expect(safeBasename(`${prefix}-1.txt`)).not.toBe(safeBasename(`${prefix}-2.txt`));
    });

    it('returns an already portable name unchanged', () => {
      expect(safeBasename('report_.png')).toBe('report_.png');
    });

    it('treats a tagged name as already portable', () => {
      const written = safeBasename('report?.png');
      expect(safeBasename(written)).toBe(written);
    });
  });

  it('names the value in the error using the given label', () => {
    expect(() => safeBasename('..', 'mount path')).toThrow(/mount path/);
  });
});
