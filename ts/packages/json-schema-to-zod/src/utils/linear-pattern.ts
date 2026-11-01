import { RE2JS } from 're2js';
import { toUnicodePattern } from './unicode-pattern';

/**
 * ECMAScript `\s`: the characters it matches, spelled for an RE2 class body.
 * RE2's own `\s` is ASCII-only, so both `\s` and `\S` are spelled out.
 */
const WHITESPACE =
  '\\t\\n\\x{B}\\f\\r\\x{20}\\x{A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}';
/** The complement of {@link WHITESPACE}, usable inside another class. */
const NON_WHITESPACE =
  '\\x{0}-\\x{8}\\x{E}-\\x{1F}\\x{21}-\\x{9F}\\x{A1}-\\x{167F}\\x{1681}-\\x{1FFF}\\x{200B}-\\x{2027}\\x{202A}-\\x{202E}\\x{2030}-\\x{205E}\\x{2060}-\\x{2FFF}\\x{3001}-\\x{FEFE}\\x{FF00}-\\x{10FFFF}';
const ANY_CHARACTER = '\\x{0}-\\x{10FFFF}';
/** ECMAScript `.` without the `s` flag excludes every line terminator, not just `\n`. */
const DOT = '[^\\n\\r\\x{2028}\\x{2029}]';
const SYNTAX_CHARACTERS = new Set('^$\\.*+?()[]{}|/-');
const CONTROL_ESCAPES = new Set('fnrtv');
const PASSTHROUGH_CLASS_ESCAPES = new Set('dDwW');

const codePoint = (code: number): string => `\\x{${code.toString(16).toUpperCase()}}`;

/** Thrown inside the translator for constructs RE2 cannot express. */
class Unsupported extends Error {}

/**
 * Reads one escape at `pattern[index] === '\\'` that is valid in both a class
 * and the top level, returning its RE2 spelling and the index after it.
 */
const readEscape = (pattern: string, index: number, inClass: boolean): [string, number] => {
  const escaped = pattern[index + 1] ?? '';

  if (PASSTHROUGH_CLASS_ESCAPES.has(escaped) || CONTROL_ESCAPES.has(escaped)) {
    return [`\\${escaped}`, index + 2];
  }
  if (escaped === 's') {
    return [inClass ? WHITESPACE : `[${WHITESPACE}]`, index + 2];
  }
  if (escaped === 'S') {
    return [inClass ? NON_WHITESPACE : `[^${WHITESPACE}]`, index + 2];
  }
  if (escaped === 'b' || escaped === 'B') {
    // Inside a class `\b` is a backspace; `\B` is not allowed there.
    return [inClass ? codePoint(8) : `\\${escaped}`, index + 2];
  }
  if (escaped === '0') {
    return [codePoint(0), index + 2];
  }
  if (escaped === 'c') {
    return [codePoint(pattern.charCodeAt(index + 2) % 32), index + 3];
  }
  if (escaped === 'x') {
    return [codePoint(parseInt(pattern.slice(index + 2, index + 4), 16)), index + 4];
  }
  if (escaped === 'u') {
    if (pattern[index + 2] === '{') {
      const end = pattern.indexOf('}', index + 3);
      return [codePoint(parseInt(pattern.slice(index + 3, end), 16)), end + 1];
    }
    const unit = parseInt(pattern.slice(index + 2, index + 6), 16);
    const low = /^\\u([Dd][C-Fc-f][0-9A-Fa-f]{2})/.exec(pattern.slice(index + 6));
    if (unit >= 0xd800 && unit <= 0xdbff && low) {
      // The Unicode grammar reads an escaped surrogate pair as one code point.
      const combined = (unit - 0xd800) * 0x400 + (parseInt(low[1], 16) - 0xdc00) + 0x10000;
      return [codePoint(combined), index + 12];
    }
    return [codePoint(unit), index + 6];
  }
  if (SYNTAX_CHARACTERS.has(escaped)) {
    return [`\\${escaped}`, index + 2];
  }
  // Backreferences have no linear-time implementation, and RE2 names Unicode
  // properties differently.
  throw new Unsupported();
};

/** Translates a class starting at `pattern[index] === '['`. */
const readClass = (pattern: string, index: number): [string, number] => {
  let cursor = index + 1;
  const negated = pattern[cursor] === '^';
  if (negated) {
    cursor++;
  }
  if (pattern[cursor] === ']') {
    // `[]` matches nothing and `[^]` matches everything; RE2 reads a leading
    // `]` as a literal instead.
    return [negated ? `[${ANY_CHARACTER}]` : `[^${ANY_CHARACTER}]`, cursor + 1];
  }

  let body = '';
  while (pattern[cursor] !== ']') {
    const char = pattern[cursor];
    if (char === '\\') {
      const [spelled, next] = readEscape(pattern, cursor, true);
      body += spelled;
      cursor = next;
    } else {
      // `[` and `^` are literals here but could start a POSIX class or a
      // negation in RE2.
      body += char === '[' || char === '^' ? `\\${char}` : char;
      cursor += char.length;
    }
  }
  return [`[${negated ? '^' : ''}${body}]`, cursor + 1];
};

/**
 * Translates a pattern written in the ECMAScript Unicode (`u` flag) grammar
 * into RE2 syntax with the same meaning. The input must already compile with
 * the `u` flag. Returns `undefined` for constructs that need a backtracking
 * engine (lookaround, backreferences) or that RE2 spells differently.
 */
export const unicodePatternToRe2 = (pattern: string): string | undefined => {
  let result = '';
  let index = 0;
  try {
    while (index < pattern.length) {
      const char = pattern[index];
      if (char === '\\') {
        const [spelled, next] = readEscape(pattern, index, false);
        result += spelled;
        index = next;
      } else if (char === '[') {
        const [spelled, next] = readClass(pattern, index);
        result += spelled;
        index = next;
      } else if (char === '.') {
        result += DOT;
        index++;
      } else if (char === '(' && pattern[index + 1] === '?') {
        if (pattern[index + 2] === ':') {
          result += '(?:';
          index += 3;
        } else if (pattern[index + 2] === '<' && !'=!'.includes(pattern[index + 3] ?? '')) {
          // A named group keeps its number; the name is irrelevant to matching.
          result += '(';
          index = pattern.indexOf('>', index) + 1;
        } else {
          throw new Unsupported();
        }
      } else {
        result += char;
        index++;
      }
    }
  } catch (error) {
    if (error instanceof Unsupported) {
      return undefined;
    }
    throw error;
  }
  return result;
};

/**
 * Compiles a Unicode-grammar pattern for RE2JS, whose matching time is linear
 * in the input for every pattern. Returns `undefined` when RE2 cannot express
 * the pattern.
 */
export const compileLinearPattern = (unicodePattern: string): RE2JS | undefined => {
  const re2 = unicodePatternToRe2(unicodePattern);
  if (re2 === undefined) {
    return undefined;
  }
  try {
    return RE2JS.compile(re2);
  } catch {
    return undefined;
  }
};

/** A quantifier whose range (maximum minus minimum) exceeds this counts as unbounded. */
const LARGE_QUANTIFIER_RANGE = 16;
/** Bound on the product of the ranges of all small variable quantifiers. */
const MAX_SMALL_QUANTIFIER_PRODUCT = 64;
/** Absolute explicit repeat bounds, including repetitions of zero-width assertions. */
const MAX_FALLBACK_REPEAT_COUNT = 64;
/** Bound on the polynomial degree of the backtracking search in the input length. */
const MAX_BACKTRACKING_DEGREE = 2;
const BRACE_QUANTIFIER = /^\{(\d+)(,(\d*))?\}/;

type Group = {
  lookaround: boolean;
  quantified: boolean;
  alternation: boolean;
  branches: number;
};

/**
 * Whether a pattern that RE2 cannot run (it needs lookaround or a
 * backreference) is still safe for the native backtracking engine on short
 * input. Deliberately conservative, since only such patterns reach it:
 *
 * - no backreferences;
 * - no quantified group that contains a quantifier or an alternation, the
 *   shapes behind exponential backtracking (`(a+)+`, `(a|a)*`);
 * - no lookaround nested in another lookaround;
 * - explicit repetition bounds are capped, including fixed assertions;
 * - the search is at most quadratic: one degree for an unanchored start, plus
 *   the number of unbounded quantifiers at the top level, plus the largest
 *   number inside a single lookaround (lookarounds are atomic, so they add
 *   rather than multiply);
 * - small variable quantifiers (`?`, `{1,3}`) and alternations multiply the
 *   work by a bounded constant (`(?:a|aa)(?:a|aa)...b` is exponential without
 *   any quantifier).
 * A leading anchor removes search work only without a top-level alternative.
 *
 * Callers still bound the input length, which keeps the quadratic case cheap.
 */
export const isSafeForBacktracking = (pattern: string): boolean => {
  const hasNamedGroup = /\(\?<(?![=!])/.test(pattern);
  const newGroup = (lookaround: boolean): Group => ({
    lookaround,
    quantified: false,
    alternation: false,
    branches: 1,
  });
  const stack: Group[] = [newGroup(false)];
  let topLevelLarge = 0;
  let lookaroundLarge = 0;
  let maxLookaroundLarge = 0;
  let smallProduct = 1;
  let lastAtomGroup: Group | undefined;
  let index = 0;

  const insideLookaround = () => stack.some(group => group.lookaround);
  const multiply = (factor: number): boolean => {
    smallProduct *= factor;
    return smallProduct <= MAX_SMALL_QUANTIFIER_PRODUCT;
  };

  while (index < pattern.length) {
    const char = pattern[index];
    const current = stack[stack.length - 1];

    let quantifierLength = 0;
    let range = 0;
    if (char === '*' || char === '+') {
      quantifierLength = 1;
      range = Infinity;
    } else if (char === '?') {
      quantifierLength = 1;
      range = 1;
    } else if (char === '{') {
      const brace = BRACE_QUANTIFIER.exec(pattern.slice(index));
      if (brace) {
        quantifierLength = brace[0].length;
        const minimum = Number(brace[1]);
        const maximum = brace[2] === undefined ? minimum : Number(brace[3]);
        if (
          minimum > MAX_FALLBACK_REPEAT_COUNT ||
          (brace[3] !== '' && maximum > MAX_FALLBACK_REPEAT_COUNT)
        ) {
          return false;
        }
        if (brace[2] !== undefined) {
          range = brace[3] === '' ? Infinity : Number(brace[3]) - Number(brace[1]);
        }
      }
    }

    if (quantifierLength > 0) {
      if (lastAtomGroup && (lastAtomGroup.quantified || lastAtomGroup.alternation)) {
        return false;
      }
      if (range > LARGE_QUANTIFIER_RANGE) {
        if (insideLookaround()) {
          maxLookaroundLarge = Math.max(maxLookaroundLarge, ++lookaroundLarge);
        } else {
          topLevelLarge++;
        }
      } else if (range > 0 && !multiply(range + 1)) {
        return false;
      }
      current.quantified = true;
      index += quantifierLength;
      if (pattern[index] === '?') {
        index++;
      }
      lastAtomGroup = undefined;
      continue;
    }

    lastAtomGroup = undefined;
    if (char === '\\') {
      const escaped = pattern[index + 1] ?? '';
      if (/^[1-9]$/.test(escaped) || (escaped === 'k' && hasNamedGroup)) {
        return false;
      }
      index += 2;
    } else if (char === '[') {
      index++;
      while (index < pattern.length && pattern[index] !== ']') {
        index += pattern[index] === '\\' ? 2 : 1;
      }
      index++;
    } else if (char === '(') {
      const lookaround =
        pattern[index + 1] === '?' &&
        ('=!'.includes(pattern[index + 2] ?? '') ||
          (pattern[index + 2] === '<' && '=!'.includes(pattern[index + 3] ?? '')));
      if (lookaround) {
        if (insideLookaround()) {
          return false;
        }
        lookaroundLarge = 0;
      }
      stack.push(newGroup(lookaround));
      index++;
      if (pattern[index] === '?') {
        // Skip the group prefix so its `?` is not read as a quantifier.
        index += lookaround && pattern[index + 1] === '<' ? 3 : 2;
      }
    } else if (char === ')') {
      const closed = stack.length > 1 ? stack.pop()! : current;
      if (!multiply(closed.branches)) {
        return false;
      }
      const parent = stack[stack.length - 1];
      parent.quantified ||= closed.quantified;
      parent.alternation ||= closed.alternation;
      lastAtomGroup = closed;
      index++;
    } else {
      if (char === '|') {
        current.alternation = true;
        current.branches++;
      }
      index++;
    }
  }
  if (!multiply(stack[0].branches)) {
    return false;
  }

  const unanchored = pattern.startsWith('^') && stack[0].branches === 1 ? 0 : 1;
  return unanchored + topLevelLarge + maxLookaroundLarge <= MAX_BACKTRACKING_DEGREE;
};

/**
 * Longest input the backtracking fallback runs on. Longer input is treated as
 * matching: skipping a constraint only widens what the schema accepts, which
 * a hostile schema could do anyway by omitting the pattern.
 */
export const MAX_BACKTRACKING_INPUT_LENGTH = 1000;

/**
 * How a schema pattern is evaluated:
 *
 * - `linear`: RE2JS runs it, in time linear in the input.
 * - `backtracking`: the pattern needs lookaround, but passes
 *   {@link isSafeForBacktracking}; the native engine runs it on input up to
 *   {@link MAX_BACKTRACKING_INPUT_LENGTH} characters.
 * - `unenforced`: neither applies, so the constraint is not checked rather
 *   than exposing validation to catastrophic backtracking.
 */
export type PatternMatcher =
  | { readonly kind: 'linear'; readonly regex: RE2JS }
  | { readonly kind: 'backtracking'; readonly regex: RegExp }
  | { readonly kind: 'unenforced' };

/**
 * Builds the matcher for a schema pattern in the legacy (no `u` flag) grammar
 * the rest of this package accepts. `pattern` must already compile as a
 * `RegExp`.
 */
export const createPatternMatcher = (pattern: string): PatternMatcher => {
  const unicodePattern = toUnicodePattern(pattern);
  const linear = unicodePattern === undefined ? undefined : compileLinearPattern(unicodePattern);
  if (linear !== undefined) {
    return { kind: 'linear', regex: linear };
  }
  if (isSafeForBacktracking(pattern)) {
    return { kind: 'backtracking', regex: new RegExp(pattern) };
  }
  return { kind: 'unenforced' };
};

/** Whether `input` satisfies the pattern behind `matcher`. */
export const patternMatches = (matcher: PatternMatcher, input: string): boolean => {
  switch (matcher.kind) {
    case 'linear':
      return matcher.regex.test(input);
    case 'backtracking':
      if (input.length > MAX_BACKTRACKING_INPUT_LENGTH) {
        return true;
      }
      matcher.regex.lastIndex = 0;
      return matcher.regex.test(input);
    case 'unenforced':
      return true;
  }
};
