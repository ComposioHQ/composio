import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { platform } from '../../src/platform/workerd';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKERD_SOURCE = path.resolve(__dirname, '../../src/platform/workerd.ts');

/**
 * Byte-for-byte copies of the regex logic that shipped before the
 * js/polynomial-redos fix. The rewritten implementation must agree with these
 * on every input, so behavior is pinned without asserting on timing.
 */
const referenceJoinPath = (...paths: string[]): string =>
  paths
    .map((segment, index) =>
      index === 0 ? segment.replace(/\/+$/, '') : segment.replace(/^\/+|\/+$/g, '')
    )
    .filter(Boolean)
    .join('/');

const referenceBasename = (filePath: string): string => {
  const segments = filePath.replace(/\/+$/, '').split('/');
  return segments[segments.length - 1] || '';
};

const CASES = [
  '',
  '/',
  '//',
  '///',
  'a',
  '/a',
  'a/',
  '/a/',
  '//a//',
  'a/b',
  '/a/b/',
  'a//b',
  '.',
  '..',
  './a',
  'foo.txt',
  '/tmp/foo.txt',
  'tmp//',
  '//tmp//foo.txt//',
  ' ',
  '/ /',
  '/'.repeat(64),
  `${'/'.repeat(32)}a${'/'.repeat(32)}`,
];

describe('workerd platform path helpers (js/polynomial-redos regression)', () => {
  it('basename matches the pre-fix regex implementation for every input', () => {
    for (const input of CASES) {
      expect(platform.basename(input)).toBe(referenceBasename(input));
    }
  });

  it('joinPath matches the pre-fix regex implementation for single segments', () => {
    for (const input of CASES) {
      expect(platform.joinPath(input)).toBe(referenceJoinPath(input));
    }
  });

  it('joinPath matches the pre-fix regex implementation for every segment pair', () => {
    for (const first of CASES) {
      for (const second of CASES) {
        expect(platform.joinPath(first, second)).toBe(referenceJoinPath(first, second));
      }
    }
  });

  it('joinPath matches the pre-fix regex implementation for three segments', () => {
    for (const middle of CASES) {
      expect(platform.joinPath('/base', middle, 'leaf.txt')).toBe(
        referenceJoinPath('/base', middle, 'leaf.txt')
      );
    }
  });

  it('returns the documented result for long runs of slashes', () => {
    const allSlashes = '/'.repeat(50_000);
    expect(platform.basename(allSlashes)).toBe('');
    expect(platform.joinPath(allSlashes)).toBe('');
    expect(platform.joinPath(allSlashes, `${allSlashes}name.txt${allSlashes}`)).toBe('name.txt');
  });

  it('preserves exact path matching when no filesystem is available', () => {
    expect(platform.isFileSystemCaseSensitive('/virtual/.Kube/config')).toBe(true);
  });

  it('rejects backtracking-prone slash-trim regexes at the source level', () => {
    const source = readFileSync(WORKERD_SOURCE, 'utf8');
    // Matches an escaped slash immediately followed by a `+`/`*` or a
    // `{n,m}` quantifier -- the shape that backtracks quadratically on long
    // slash runs, regardless of exact spelling or whitespace. This catches
    // not just the original `/\/+$/` and `/^\/+|\/+$/g` literals but
    // reformatted equivalents like `/\/{1,}$/` or `new RegExp('\\/+$')`.
    // Scans raw file text, including comments, so quoting a vulnerable
    // pattern in a comment would also fail this assertion -- intentional,
    // since that's the only way to catch a silent revert to the regex form.
    const VULNERABLE_SLASH_QUANTIFIER = /\\\/(?:[+*]|\{\d*,?\d*\})/;
    expect(source).not.toMatch(VULNERABLE_SLASH_QUANTIFIER);
  });
});
