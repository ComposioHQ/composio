import type { Refs } from '../types';
import { createPatternMatcher, patternMatches, type PatternMatcher } from './linear-pattern';

/**
 * Longest `pattern` / `patternProperties` key this package compiles. Tool
 * schemas come from third-party toolkit definitions; anything past this is
 * far outside what a format constraint needs and is rejected before it can
 * cost anything at validation time.
 */
export const MAX_PATTERN_LENGTH = 1024;

export type InvalidPatternReason = 'syntax' | 'too-long' | 'unsupported';

/**
 * Raised at conversion time when a schema `pattern` cannot be turned into a
 * `RegExp`. Conversion fails eagerly, in line with how this package and
 * `@composio/json-schema-to-effect-schema` treat other schema defects: a broken
 * schema is the tool author's bug, so it surfaces once at construction rather
 * than on every validation as if the caller's input were wrong.
 */
export class InvalidPatternError extends Error {
  override readonly name = 'InvalidPatternError';

  constructor(
    readonly keyword: 'pattern' | 'patternProperties',
    readonly pattern: string,
    readonly path: ReadonlyArray<string | number>,
    readonly reason: InvalidPatternReason,
    detail: string,
    options?: ErrorOptions
  ) {
    const location = path.length > 0 ? path.join('.') : '<root>';
    super(
      `Invalid ${keyword} regular expression ${JSON.stringify(pattern)} at ${location}: ${detail}`,
      options
    );
  }
}

/**
 * A schema pattern as a `RegExp` whose matching cannot be made to backtrack
 * catastrophically. The native `source` stays intact, so JSON Schema emitted
 * from the Zod schema still carries the original pattern for the model, while
 * `test` and `exec` go through a {@link PatternMatcher}: RE2 where it can run
 * the pattern, otherwise a statically vetted, length-bounded native match, or
 * no check at all.
 */
export class SchemaPatternRegExp extends RegExp {
  readonly matcher: PatternMatcher;

  constructor(pattern: string, matcher: PatternMatcher = createPatternMatcher(pattern)) {
    super(pattern);
    this.matcher = matcher;
  }

  override test(input: string): boolean {
    return patternMatches(this.matcher, String(input));
  }

  override exec(input: string): RegExpExecArray | null {
    const string = String(input);
    switch (this.matcher.kind) {
      case 'linear':
        return this.matcher.regex.exec(string) as RegExpExecArray | null;
      case 'backtracking':
        return patternMatches(this.matcher, string) ? this.matcher.regex.exec(string) : null;
      case 'unenforced':
        return null;
    }
  }

  // `split` and `matchAll` build a derived regex through the species
  // constructor, whose signature this class does not share. Only `test` and
  // `exec`, which Zod and the guard call, are protected.
  static override get [Symbol.species](): RegExpConstructor {
    return RegExp;
  }
}

/**
 * Compile a schema pattern, rejecting anything that does not compile or that
 * exceeds {@link MAX_PATTERN_LENGTH}.
 *
 * Matching is protected against catastrophic backtracking (ReDoS): tool
 * arguments come from a model that may be steered by untrusted content, and
 * object keys are as attacker-influenced as values. Patterns run on RE2,
 * which is linear-time. A `pattern` RE2 cannot express (lookaround) falls back
 * to the native engine only when it passes a conservative static check, and
 * only on bounded input; otherwise it is left unenforced, which widens the
 * schema no further than omitting the pattern would. A `patternProperties`
 * key decides which schema applies to a property, so it is never silently
 * skipped: one RE2 cannot express is rejected at conversion.
 *
 * No `u` flag is passed: existing tool schemas rely on identity escapes that
 * Unicode mode refuses, and the goal here is to fail on defects, not to
 * tighten which patterns are accepted.
 */
export const compilePattern = (
  keyword: 'pattern' | 'patternProperties',
  pattern: string,
  refs: Pick<Refs, 'path'>
): SchemaPatternRegExp => {
  const path = keyword === 'pattern' ? refs.path : [...refs.path, 'patternProperties', pattern];

  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new InvalidPatternError(
      keyword,
      pattern,
      path,
      'too-long',
      `pattern exceeds ${MAX_PATTERN_LENGTH} characters`
    );
  }

  try {
    new RegExp(pattern);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new InvalidPatternError(keyword, pattern, path, 'syntax', detail, { cause });
  }

  const matcher = createPatternMatcher(pattern);
  if (keyword === 'patternProperties' && matcher.kind !== 'linear') {
    throw new InvalidPatternError(
      keyword,
      pattern,
      path,
      'unsupported',
      'patternProperties keys must not use lookaround or backreferences'
    );
  }
  return new SchemaPatternRegExp(pattern, matcher);
};
