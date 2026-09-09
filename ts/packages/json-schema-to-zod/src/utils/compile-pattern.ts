import type { Refs } from '../types';

/**
 * Longest `pattern` / `patternProperties` key this package compiles. Tool
 * schemas come from third-party toolkit definitions; anything past this is
 * far outside what a format constraint needs and is rejected before it can
 * cost anything at validation time.
 */
export const MAX_PATTERN_LENGTH = 1024;

export type InvalidPatternReason = 'syntax' | 'nested-quantifier' | 'too-long';

/**
 * Raised at conversion time when a schema `pattern` cannot be turned into a
 * safe `RegExp`. Conversion fails eagerly, in line with how this package and
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
 * Whether the pattern nests an unbounded quantifier (`*`, `+`, `{n,}`) inside
 * a group that is itself unboundedly quantified, such as `(a+)+` or
 * `(\d*x)*`. This is the star-height check `safe-regex` popularised: it is
 * purely syntactic, so it misses alternation-driven blowups like `(a|aa)+`
 * and flags some patterns that backtrack linearly in practice, but it catches
 * the canonical catastrophic shapes without a regex engine or a dependency.
 */
export const hasNestedUnboundedQuantifier = (pattern: string): boolean => {
  // One entry per open group: whether an unbounded quantifier appeared inside it.
  const openGroups: boolean[] = [];
  let closedGroupHadUnbounded = false;
  let afterGroupClose = false;
  let inClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];

    if (char === '\\') {
      i += 1;
      afterGroupClose = false;
      continue;
    }

    if (inClass) {
      if (char === ']') inClass = false;
      continue;
    }

    let unbounded = false;
    switch (char) {
      case '[':
        inClass = true;
        break;
      case '(':
        openGroups.push(false);
        break;
      case ')':
        closedGroupHadUnbounded = openGroups.pop() ?? false;
        afterGroupClose = true;
        continue;
      case '*':
      case '+':
        unbounded = true;
        break;
      case '{': {
        const close = pattern.indexOf('}', i);
        const body = close === -1 ? '' : pattern.slice(i + 1, close);
        if (/^\d+,$/.test(body)) {
          unbounded = true;
        }
        if (close !== -1 && /^\d+(,\d*)?$/.test(body)) {
          i = close;
        }
        break;
      }
      default:
        break;
    }

    if (unbounded) {
      if (afterGroupClose && closedGroupHadUnbounded) {
        return true;
      }
      for (let depth = 0; depth < openGroups.length; depth++) {
        openGroups[depth] = true;
      }
    }

    afterGroupClose = false;
  }

  return false;
};

/**
 * Compile a schema pattern, rejecting anything that could not be compiled or
 * that the {@link hasNestedUnboundedQuantifier} heuristic marks as unsafe.
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

  if (hasNestedUnboundedQuantifier(pattern)) {
    throw new InvalidPatternError(
      keyword,
      pattern,
      path,
      'nested-quantifier',
      'nested unbounded quantifiers can backtrack catastrophically'
    );
  }

  try {
    return new RegExp(pattern);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new InvalidPatternError(keyword, pattern, path, 'syntax', detail, { cause });
  }
};
