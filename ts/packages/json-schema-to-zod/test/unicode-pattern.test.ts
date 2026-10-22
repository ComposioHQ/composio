import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { toUnicodePattern } from '../src/utils/unicode-pattern';

const compiles = (pattern: string, flags?: string): boolean => {
  try {
    new RegExp(pattern, flags);
    return true;
  } catch {
    return false;
  }
};

const legacyCases: ReadonlyArray<{ pattern: string; matches: string[]; rejects: string[] }> = [
  { pattern: '^[a-z\\_]+$', matches: ['a_b'], rejects: ['A'] },
  { pattern: '^\\k_$', matches: ['k_'], rejects: ['wrong', '\\k_'] },
  { pattern: '^a\\:b\\@c$', matches: ['a:b@c'], rejects: ['ab'] },
  { pattern: '^a{$', matches: ['a{'], rejects: ['a'] },
  { pattern: '^}]$', matches: ['}]'], rejects: [']'] },
  { pattern: '^\\x4$', matches: ['x4'], rejects: ['\x04'] },
  { pattern: '^\\u12$', matches: ['u12'], rejects: ['\u0012'] },
  { pattern: '^\\p{L}$', matches: ['p{L}'], rejects: ['a'] },
  { pattern: '^\\u{2}$', matches: ['uu'], rejects: ['\u0002'] },
  { pattern: '^\\c$', matches: ['\\c'], rejects: ['c'] },
  { pattern: '^[\\c1]$', matches: ['\x11'], rejects: ['1'] },
  { pattern: '^\\1$', matches: ['\x01'], rejects: ['1'] },
  { pattern: '^(a)\\1\\2$', matches: ['aa\x02'], rejects: ['aa'] },
  { pattern: '^\\8$', matches: ['8'], rejects: ['\\8'] },
  { pattern: '^[\\w-.]+$', matches: ['a-b.c'], rejects: ['a b'] },
  { pattern: '^[.-\\d]$', matches: ['-', '5'], rejects: ['/'] },
  { pattern: '^[\\B]$', matches: ['B'], rejects: ['b'] },
];

describe('toUnicodePattern', () => {
  it.each(legacyCases)('gives $pattern its legacy meaning', ({ pattern, matches, rejects }) => {
    const unicode = toUnicodePattern(pattern);
    expect(unicode).toBeDefined();

    for (const value of [...matches, ...rejects]) {
      expect(new RegExp(unicode!, 'u').test(value), value).toBe(new RegExp(pattern).test(value));
    }
    expect(matches.every(value => new RegExp(pattern).test(value))).toBe(true);
    expect(rejects.some(value => new RegExp(pattern).test(value))).toBe(false);
  });

  it('keeps patterns that already mean the same in both grammars', () => {
    expect(toUnicodePattern('^[a-z]+(?:-[a-z]+)*$')).toBe('^[a-z]+(?:-[a-z]+)*$');
    expect(toUnicodePattern('^(?<year>\\d{4})-\\k<year>$')).toBe('^(?<year>\\d{4})-\\k<year>$');
  });

  it('returns undefined for a quantified lookahead, which has no Unicode spelling', () => {
    expect(compiles('^(?=a){2}a$')).toBe(true);
    expect(toUnicodePattern('^(?=a){2}a$')).toBeUndefined();
  });

  it('matches exactly what the legacy pattern matches on ASCII input', () => {
    const pattern = fc
      .array(
        fc.constantFrom(
          ...'ab_:-.^$*+?()[]{}|/\\0189cdkpuxBDSWw,'.split(''),
          '\\',
          '\\\\',
          '{2}',
          '{1,3}'
        ),
        { maxLength: 12 }
      )
      .map(parts => parts.join(''))
      .filter(candidate => compiles(candidate));
    const input = fc.string({ unit: fc.constantFrom(...'ab_:-.^${}[]\\/ 019cdkpuxBw,'.split('')) });

    fc.assert(
      fc.property(pattern, fc.array(input, { maxLength: 8 }), (candidate, values) => {
        const unicode = toUnicodePattern(candidate);
        if (unicode === undefined) {
          return;
        }
        for (const value of values) {
          expect(new RegExp(unicode, 'u').test(value)).toBe(new RegExp(candidate).test(value));
        }
      }),
      { numRuns: 2000 }
    );
  });
});
