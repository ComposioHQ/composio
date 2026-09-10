import type { Refs } from '../types';

/**
 * Longest `pattern` / `patternProperties` key this package compiles. Tool
 * schemas come from third-party toolkit definitions; anything past this is
 * far outside what a format constraint needs and is rejected before it can
 * cost anything at validation time.
 */
export const MAX_PATTERN_LENGTH = 1024;

export type InvalidPatternReason = 'syntax' | 'too-long';

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
 * Compile a schema pattern, rejecting anything that does not compile or that
 * exceeds {@link MAX_PATTERN_LENGTH}.
 *
 * Both guards have no false positives: a pattern that fails here would never
 * have worked. No backtracking (ReDoS) heuristic is applied on purpose — the
 * syntactic checks that exist flag linear patterns such as `^(\d+\.)*\d+$`,
 * and a wrong rejection fails the whole tool the schema belongs to. A hostile
 * `pattern` that backtracks catastrophically remains a known limitation.
 *
 * No `u` flag is passed: existing tool schemas rely on identity escapes that
 * Unicode mode refuses, and the goal here is to fail on defects, not to
 * tighten which patterns are accepted.
 */
export const compilePattern = (
  keyword: 'pattern' | 'patternProperties',
  pattern: string,
  refs: Pick<Refs, 'path'>
): RegExp => {
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
    return new RegExp(pattern);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new InvalidPatternError(keyword, pattern, path, 'syntax', detail, { cause });
  }
};
