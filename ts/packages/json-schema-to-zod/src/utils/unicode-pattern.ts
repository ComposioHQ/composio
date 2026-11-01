const compilesAsUnicode = (pattern: string): boolean => {
  try {
    new RegExp(pattern, 'u');
    return true;
  } catch {
    return false;
  }
};

const REGEX_SYNTAX_CHARACTERS = new Set('^$\\.*+?()[]{}|/');
const CHARACTER_CLASS_ESCAPES = new Set('dDwWsS');
const CONTROL_ESCAPES = new Set('fnrtv');
const HEX_DIGIT = /^[0-9A-Fa-f]$/;
const QUANTIFIER = /^\{\d+(?:,\d*)?\}/;

const hexEscape = (code: number): string => `\\x${code.toString(16).padStart(2, '0')}`;

/** Capturing group count and whether any is named, as the parser counts them. */
const scanGroups = (pattern: string): { count: number; named: boolean } => {
  let count = 0;
  let named = false;
  let inClass = false;
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === '\\') {
      index++;
    } else if (inClass) {
      inClass = char !== ']';
    } else if (char === '[') {
      inClass = true;
    } else if (char === '(') {
      if (pattern[index + 1] !== '?') {
        count++;
      } else if (pattern[index + 2] === '<' && !'=!'.includes(pattern[index + 3] ?? '')) {
        count++;
        named = true;
      }
    }
  }
  return { count, named };
};

/**
 * A legacy octal escape (a `\` digit sequence that is not a backreference) as
 * a hex escape. Returns the replacement and how many digits it consumed.
 */
const legacyOctalEscape = (pattern: string, index: number): [string, number] => {
  const first = pattern[index];
  if (first === '8' || first === '9') {
    return [first, 1];
  }
  const maxDigits = first <= '3' ? 3 : 2;
  let digits = first;
  while (digits.length < maxDigits && /^[0-7]$/.test(pattern[index + digits.length] ?? '')) {
    digits += pattern[index + digits.length];
  }
  return [hexEscape(parseInt(digits, 8)), digits.length];
};

/**
 * The interpreter compiles every pattern with the `u` flag, while
 * `compilePattern` and the native parsers deliberately do not. This spells a
 * pattern written for the legacy (Annex B) grammar in the Unicode grammar with
 * the same meaning: identity escapes such as `\_`, `\:` or `\k` become the
 * literal character, incomplete `\x`, `\u` and `\c` escapes and legacy octal
 * escapes are spelled out, lone `{`, `}` and `]` are escaped, and a hyphen
 * next to a class escape (`[\w-.]`), which is a literal there, is escaped.
 *
 * Returns `undefined` for the few legacy constructs with no Unicode spelling,
 * such as a quantified lookahead. Matching differs only for astral
 * characters, which `.` and negated classes treat as one character, not two.
 */
export const toUnicodePattern = (pattern: string): string | undefined => {
  const { count: groupCount, named: hasNamedGroups } = scanGroups(pattern);

  let rewritten = '';
  let inClass = false;
  let previousAtomWasClassEscape = false;
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index];

    if (char !== '\\' && inClass) {
      if (char === ']') {
        inClass = false;
        rewritten += char;
      } else if (
        char === '-' &&
        (previousAtomWasClassEscape ||
          (pattern[index + 1] === '\\' && CHARACTER_CLASS_ESCAPES.has(pattern[index + 2] ?? '')))
      ) {
        rewritten += '\\-';
      } else {
        rewritten += char;
      }
      previousAtomWasClassEscape = false;
      index++;
      continue;
    }

    if (char !== '\\') {
      const quantifier = char === '{' ? QUANTIFIER.exec(pattern.slice(index)) : null;
      if (char === '[') {
        inClass = true;
        const opening = pattern[index + 1] === '^' ? '[^' : '[';
        rewritten += opening;
        index += opening.length;
      } else if (quantifier) {
        rewritten += quantifier[0];
        index += quantifier[0].length;
      } else {
        rewritten += char === '{' || char === '}' || char === ']' ? `\\${char}` : char;
        index++;
      }
      continue;
    }

    const escaped = pattern[index + 1];
    if (escaped === undefined) {
      return undefined;
    }
    previousAtomWasClassEscape = false;

    if (CHARACTER_CLASS_ESCAPES.has(escaped)) {
      previousAtomWasClassEscape = inClass;
      rewritten += `\\${escaped}`;
      index += 2;
    } else if (
      CONTROL_ESCAPES.has(escaped) ||
      REGEX_SYNTAX_CHARACTERS.has(escaped) ||
      escaped === 'b' ||
      (escaped === 'B' && !inClass) ||
      (escaped === '-' && inClass) ||
      (escaped === 'k' && hasNamedGroups && !inClass)
    ) {
      rewritten += `\\${escaped}`;
      index += 2;
    } else if (escaped === 'c') {
      const letter = pattern[index + 2] ?? '';
      if (/^[A-Za-z]$/.test(letter)) {
        rewritten += `\\c${letter}`;
        index += 3;
      } else if (inClass && /^[0-9_]$/.test(letter)) {
        rewritten += hexEscape(letter.charCodeAt(0) % 32);
        index += 3;
      } else {
        // Without a control letter, `\c` is a literal backslash and the `c`
        // that follows is an ordinary character.
        rewritten += '\\\\';
        index++;
      }
    } else if (escaped === 'x' || escaped === 'u') {
      const length = escaped === 'x' ? 2 : 4;
      const digits = pattern.slice(index + 2, index + 2 + length);
      if (digits.length === length && [...digits].every(digit => HEX_DIGIT.test(digit))) {
        rewritten += `\\${escaped}${digits}`;
        index += 2 + length;
      } else {
        rewritten += escaped;
        index += 2;
      }
    } else if (/^[0-9]$/.test(escaped)) {
      const decimal = /^\d+/.exec(pattern.slice(index + 1))?.[0] ?? escaped;
      if (escaped === '0' && !/^[0-9]$/.test(pattern[index + 2] ?? '')) {
        rewritten += '\\0';
        index += 2;
      } else if (!inClass && escaped !== '0' && Number(decimal) <= groupCount) {
        rewritten += `\\${decimal}`;
        index += 1 + decimal.length;
      } else {
        const [replacement, consumed] = legacyOctalEscape(pattern, index + 1);
        rewritten += replacement;
        index += 1 + consumed;
      }
    } else {
      // Every other escape is an identity escape: the character itself, which
      // is not special where it stands.
      rewritten += escaped;
      index += 2;
    }
  }

  return compilesAsUnicode(rewritten) ? rewritten : undefined;
};
