import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import { InvalidPatternError, jsonSchemaToZod } from '../src/index';
import type { JsonSchema } from '../src/types';
import { compilePattern } from '../src/utils/compile-pattern';
import {
  MAX_BACKTRACKING_INPUT_LENGTH,
  compileLinearPattern,
  createPatternMatcher,
  isSafeForBacktracking,
} from '../src/utils/linear-pattern';
import { toUnicodePattern } from '../src/utils/unicode-pattern';

/** Patterns whose RE2 translation must agree with the native Unicode engine. */
const TRANSLATED_PATTERNS = [
  '^\\s+$',
  '^\\S+$',
  '^[\\s\\S]$',
  '^[^\\s]+$',
  '^[^\\S]$',
  '^.$',
  '^..$',
  '^a.b$',
  '\\u00e9',
  '^\\ud83d\\ude00$',
  '^\\u{1F600}$',
  '^[]$',
  '^[^]$',
  '^[\\b]$',
  '^\\cJ$',
  '^\\0$',
  '^(?<word>a)\\d$',
  '\\bfoo\\b',
  '\\Bo',
  '^[\\[^]+$',
  '^a{2,3}$',
  '^\\x41$',
  '^[\\w-]+$',
  '^\\D\\W$',
  '^$',
  '^(?:ab|a)b?$',
  '^[a-z\\-\\]]$',
  '^\\/\\.\\*$',
] as const;

const UNITS = [
  ' ',
  '\t',
  '\n',
  '\r',
  '\v',
  '\u00a0',
  '\u1680',
  '\u2028',
  '\u2029',
  '\ufeff',
  '\u0085',
  'a',
  'b',
  'A',
  '0',
  '_',
  '\b',
  '\u0000',
  '\u{1F600}',
  '\ud83d',
  '\u00e9',
  '-',
  '[',
  ']',
  '^',
  'f',
  'o',
  '/',
  '.',
  '*',
];

describe('unicodePatternToRe2', () => {
  it.each(TRANSLATED_PATTERNS)('matches %s exactly like the native Unicode engine', pattern => {
    const unicodePattern = toUnicodePattern(pattern) ?? pattern;
    const linear = compileLinearPattern(unicodePattern);
    expect(linear).toBeDefined();
    const native = new RegExp(unicodePattern, 'u');

    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom(...UNITS), maxLength: 4 }), input => {
        expect(linear!.test(input)).toBe(native.test(input));
      }),
      { numRuns: 300 }
    );
  });

  it.each(['^(?=a)a$', '(?<=a)b', '(?<!a)b', '^(a)\\1$', '^(?<n>a)\\k<n>$'])(
    'leaves %s to the backtracking engine',
    pattern => {
      expect(compileLinearPattern(pattern)).toBeUndefined();
    }
  );
});

describe('isSafeForBacktracking', () => {
  it.each([
    '^(?=.*[a-y])a',
    '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[A-Za-z\\d]{8,}$',
    '^(?=a){2}ab$',
    '^(?!admin$)[a-z]+$',
    '^(?:jpg|png|gif)(?=\\.)',
  ])('accepts %s', pattern => {
    expect(isSafeForBacktracking(pattern)).toBe(true);
  });

  it.each([
    ['nested quantifiers', '^(?=(a+)+$)'],
    ['a quantified alternation', '^(?=x)(a|aa)*$'],
    ['a backreference', '^(a)\\1$'],
    ['a named backreference', '^(?<n>a)\\k<n>$'],
    ['polynomial quantifiers', '(?=x).*.*y'],
    ['two unbounded quantifiers in one lookaround', '(?=.*a.*b)x'],
    ['a nested lookaround', '^(?=(?=a)a)'],
    ['an unquantified alternation chain', `(?<=)${'(?:a|aa)'.repeat(28)}b`],
    ['many optional atoms', `^(?=x)${'a?'.repeat(30)}${'a'.repeat(30)}$`],
    ['huge fixed assertion repeats', '^(?=a){1000000000}a$'],
    ['huge fixed consuming repeats', '^(?=a)a{1000000000}$'],
    ['huge finite upper bounds', '^(?=a)a{1,1000000000}$'],
    ['huge unbounded minimums', '^(?=a)a{1000000000,}$'],
    ['nested fixed assertion repeats', '^((?=a){64}){64}a$'],
    ['an unanchored alternative', '^(?=a)b|b+b+c'],
    ['an unanchored alternative with bounded choices', `^z|(?=a)${'(?:a|aa)'.repeat(5)}a*a*b$`],
  ])('rejects %s', (_, pattern) => {
    expect(isSafeForBacktracking(pattern)).toBe(false);
  });
});

const finishesQuickly = (run: () => void): void => {
  const start = performance.now();
  run();
  expect(performance.now() - start).toBeLessThan(1000);
};

const ATTACK = `${'a'.repeat(40)}!`;

describe('catastrophic backtracking (SEC-1178)', () => {
  it.each(['^(?=a){1000000000}a$', `^z|(?=a)${'(?:a|aa)'.repeat(5)}a*a*b$`])(
    'leaves unsafe fallback pattern %s unenforced',
    pattern => {
      expect(createPatternMatcher(pattern).kind).toBe('unenforced');
      const parsed = jsonSchemaToZod({ type: 'string', pattern });
      expect(parsed.safeParse('a'.repeat(MAX_BACKTRACKING_INPUT_LENGTH)).success).toBe(true);
    }
  );

  it.each(['x', 'components', 'escaped', '$id', '$anchor'])(
    'protects regexes referenced through %s',
    location => {
      const pattern = '^(a+)+$';
      let nativeExecutions = 0;
      const originalExec = RegExp.prototype.exec;
      const nativeExec = vi.spyOn(RegExp.prototype, 'exec').mockImplementation(function (
        this: RegExp,
        input: string
      ) {
        if (this.source === pattern) {
          nativeExecutions++;
          throw new Error('schema regex reached native matching');
        }
        return originalExec.call(this, input);
      });
      try {
        for (const keyword of ['pattern', 'patternProperties']) {
          const target =
            keyword === 'pattern'
              ? { type: 'string', pattern }
              : {
                  type: 'object',
                  patternProperties: { [pattern]: { type: 'integer' } },
                  additionalProperties: false,
                };
          const { extension, ref } = {
            x: { extension: { x: target }, ref: '#/x' },
            components: {
              extension: { components: { schemas: { target } } },
              ref: '#/components/schemas/target',
            },
            escaped: { extension: { 'schema/~target': target }, ref: '#/schema~1~0target' },
            // The interpreter also resolves identifiers it registers anywhere.
            $id: {
              extension: { x: { $id: 'https://example.com/target', ...target } },
              ref: 'https://example.com/target',
            },
            $anchor: { extension: { x: { $anchor: 'target', ...target } }, ref: '#target' },
          }[location]!;
          const parsed = jsonSchemaToZod({
            type: 'object',
            properties: { value: { $ref: ref } },
            ...extension,
          } as JsonSchema);
          expect(
            parsed.safeParse({ value: keyword === 'pattern' ? 'aaa' : { aaa: 1 } }).success
          ).toBe(true);
          expect(
            parsed.safeParse({ value: keyword === 'pattern' ? 'a!' : { 'a!': 1 } }).success
          ).toBe(false);
          if (keyword === 'patternProperties') {
            expect(parsed.safeParse({ value: { aaa: 'bad' } }).success).toBe(false);
          }
        }
        expect(nativeExecutions).toBe(0);
      } finally {
        nativeExec.mockRestore();
      }
    }
  );

  it.each([
    ['#/x', {}],
    ['https://example.com/target', { $id: 'https://example.com/target' }],
    ['#target', { $anchor: 'target' }],
  ])(
    'rejects unsupported key patterns in extension reference targets (%s) during conversion',
    (ref, identifier) => {
      expect(() =>
        jsonSchemaToZod({
          type: 'object',
          properties: { value: { $ref: ref } },
          x: {
            ...identifier,
            type: 'object',
            patternProperties: { '^(?=a)': { type: 'integer' } },
          },
        } as JsonSchema)
      ).toThrow(InvalidPatternError);
    }
  );

  it('keeps references through renamed keys in extension schemas valid', () => {
    const parsed = jsonSchemaToZod({
      type: 'object',
      properties: {
        keys: { $ref: '#/x' },
        value: { $ref: '#/x/patternProperties/^k' },
      },
      x: { type: 'object', patternProperties: { '^k': { type: 'integer' } } },
    } as JsonSchema);
    expect(parsed.safeParse({ keys: { k1: 1 }, value: 2 }).success).toBe(true);
    expect(parsed.safeParse({ keys: { k1: 1 }, value: 'bad' }).success).toBe(false);
  });

  it('follows reference cycles without rewriting instance data as schemas', () => {
    const parsed = jsonSchemaToZod({
      type: 'object',
      properties: { value: { $ref: '#/x' } },
      x: {
        type: 'object',
        properties: { next: { $ref: '#/x' } },
        default: { patternProperties: { '^(?=a)': {} } },
      },
    } as JsonSchema);
    expect(parsed.safeParse({ value: { next: {} } }).success).toBe(true);
  });

  it('runs a nested-quantifier pattern in linear time', () => {
    const parsed = jsonSchemaToZod({ type: 'string', pattern: '^(a+)+$' });
    finishesQuickly(() => expect(parsed.safeParse(ATTACK).success).toBe(false));
    expect(parsed.safeParse('aaa').success).toBe(true);
  });

  it('runs a backtracking patternProperties key in linear time', () => {
    const parsed = jsonSchemaToZod({
      type: 'object',
      patternProperties: { '^(a|a)*$': { type: 'integer' } },
      additionalProperties: false,
    });
    finishesQuickly(() => expect(parsed.safeParse({ [ATTACK]: 1 }).success).toBe(false));
    expect(parsed.safeParse({ aaa: 1 }).success).toBe(true);
    expect(parsed.safeParse({ aaa: 'x' }).success).toBe(false);
  });

  it('runs patterns that only the whole-schema guard sees in linear time', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { handle: { $ref: '#/$defs/handle' }, tags: { $ref: '#/$defs/tags' } },
      $defs: {
        handle: { type: 'string', pattern: '^(a+)+$' },
        tags: {
          type: 'object',
          patternProperties: { '^(a|a)*$': { type: 'integer' } },
          additionalProperties: false,
        },
      },
    };
    const parsed = jsonSchemaToZod(schema);

    finishesQuickly(() => {
      expect(parsed.safeParse({ handle: ATTACK }).success).toBe(false);
      expect(parsed.safeParse({ tags: { [ATTACK]: 1 } }).success).toBe(false);
    });
    expect(parsed.safeParse({ handle: 'aa', tags: { aa: 1 } }).success).toBe(true);
    expect(parsed.safeParse({ tags: { aa: 'x' } }).success).toBe(false);
  });

  it('runs a backtracking propertyNames pattern in linear time', () => {
    const parsed = jsonSchemaToZod({
      type: 'object',
      propertyNames: { pattern: '^(a+)+$' },
    });
    finishesQuickly(() => expect(parsed.safeParse({ [ATTACK]: 1 }).success).toBe(false));
    expect(parsed.safeParse({ aa: 1 }).success).toBe(true);
  });

  it('reports the schema pattern, not its per-value spelling, in guard errors', () => {
    const parsed = jsonSchemaToZod({
      type: 'object',
      properties: { tags: { $ref: '#/$defs/tags' } },
      $defs: { tags: { type: 'object', patternProperties: { '^t_': { type: 'integer' } } } },
    });
    const result = parsed.safeParse({ tags: { t_1: 'x' } });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).not.toContain('t_1$');
  });

  it('keeps enforcing a lookahead pattern that is safe to backtrack', () => {
    const parsed = jsonSchemaToZod({
      type: 'string',
      pattern: '^(?=.*[a-z])(?=.*\\d)[a-z\\d]{8,}$',
    });
    expect(parsed.safeParse('abcd1234').success).toBe(true);
    expect(parsed.safeParse('abcdefgh').success).toBe(false);
    // Past the input bound the fallback is skipped rather than risked.
    expect(parsed.safeParse('a'.repeat(MAX_BACKTRACKING_INPUT_LENGTH + 1)).success).toBe(true);
  });

  it('leaves a lookahead pattern that could backtrack catastrophically unenforced', () => {
    // Assembled at runtime so static analysis does not flag the test input
    // itself as an inefficient regular expression.
    const pattern = ['^(?=(a+)+', '$)a'].join('');
    const regex = compilePattern('pattern', pattern, { path: [] });
    expect(regex.matcher.kind).toBe('unenforced');
    finishesQuickly(() => expect(regex.test(ATTACK)).toBe(true));
    // The JSON Schema shown to the model still carries the pattern.
    expect(regex.source).toBe(pattern);
  });

  it('rejects a patternProperties key that needs a backtracking engine', () => {
    for (const schema of [
      { type: 'object', patternProperties: { '^(?!x)': { type: 'string' } } },
      {
        type: 'object',
        properties: { v: { $ref: '#/$defs/v' } },
        $defs: { v: { type: 'object', patternProperties: { '^(?!x)': { type: 'string' } } } },
      },
    ] as JsonSchema[]) {
      expect(() => jsonSchemaToZod(schema)).toThrow(InvalidPatternError);
    }
    try {
      compilePattern('patternProperties', '^(?!x)', { path: [] });
    } catch (error) {
      expect((error as InvalidPatternError).reason).toBe('unsupported');
    }
  });

  it('picks RE2 for every pattern it can express', () => {
    expect(createPatternMatcher('^(\\d+\\.)*\\d+$').kind).toBe('linear');
    expect(createPatternMatcher('^[a-z\\_]+$').kind).toBe('linear');
    expect(createPatternMatcher('^(?=.*[a-y])a').kind).toBe('backtracking');
  });
});
