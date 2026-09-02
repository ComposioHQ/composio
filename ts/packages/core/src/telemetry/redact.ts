/**
 * Best-effort redaction of secrets from free-form error text before it is sent
 * to the telemetry endpoint.
 *
 * Error `message` and `stack` fields routinely interpolate URLs (with
 * query-string tokens / presigned signatures), `Authorization` headers, API
 * keys, and connected-account identifiers. None of that should leave the
 * process. Structured telemetry fields never carry raw secrets, so only the two
 * free-form strings are passed through here.
 *
 * This is defence-in-depth, not a proof: it targets the shapes we have seen
 * leak. When in doubt it over-redacts rather than under-redacts.
 */

const REDACTED = '[REDACTED]';
const SECRET_KEY_PATTERN = String.raw`authorization|auth|api[-_]?key|apikey|x-api-key|access[-_]?token|refresh[-_]?token|client[-_]?secret|secret|password|passwd|pwd`;
const SECRET_KEY_WITH_PREFIX_PATTERN = String.raw`(?:[A-Za-z0-9]+_)*(?:${SECRET_KEY_PATTERN})`;
const QUOTED_SECRET_KEY_PREFIX = String.raw`(["'])(${SECRET_KEY_WITH_PREFIX_PATTERN})\1(\s*[:=]+\s*)`;
const BARE_SECRET_KEY_PREFIX = String.raw`(?<![A-Za-z0-9"'])(${SECRET_KEY_PATTERN})\b(\s*[:=]+\s*)`;
const ESCAPED_SECRET_KEY_PREFIX = String.raw`(?<![A-Za-z0-9])(${SECRET_KEY_PATTERN})\b((?:\\["'])?\s*[:=]+\s*)`;
const SECRET_PAIR_PREFIX = String.raw`(?<![A-Za-z0-9])(${SECRET_KEY_PATTERN})\b(["']?\s*[:=]+\s*)`;
const BARE_KEY_DOUBLE_QUOTED_VALUE = new RegExp(
  String.raw`${BARE_SECRET_KEY_PREFIX}"((?:\\.|[^"\\\r\n])*)"`,
  'gi'
);
const BARE_KEY_SINGLE_QUOTED_VALUE = new RegExp(
  String.raw`${BARE_SECRET_KEY_PREFIX}'((?:\\.|[^'\\\r\n])*)'`,
  'gi'
);
const BARE_KEY_ESCAPED_DOUBLE_QUOTED_VALUE = new RegExp(
  String.raw`${ESCAPED_SECRET_KEY_PREFIX}\\"((?:\\.|[^"\\\r\n])*)\\"`,
  'gi'
);
const BARE_KEY_ESCAPED_SINGLE_QUOTED_VALUE = new RegExp(
  String.raw`${ESCAPED_SECRET_KEY_PREFIX}\\'((?:\\.|[^'\\\r\n])*)\\'`,
  'gi'
);
const SECRET_PAIR_UNQUOTED = new RegExp(
  String.raw`${SECRET_PAIR_PREFIX}(?!\\["'])([^\s"',}&]+)`,
  'gi'
);
const CONTAINS_QUOTED_FIELD = /(?:^|[,{\s])(["'])[^"'\\\r\n]+\1\s*[:=]\s*$/;

const REDACTION_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // URL query strings — tokens, presigned signatures, one-time codes.
  [/(\bhttps?:\/\/[^\s?#'"]+)\?[^\s'"]*/gi, `$1?${REDACTED}`],
  // Authorization scheme + credential: `Bearer <token>`, `Basic <token>`.
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`],
  // Secret-ish `key: value` / `key=value` / `key: "value"` / `key: 'value'` pairs.
  // Match quoted keys separately so key-like prose cannot treat an enclosing
  // string's closing quote as the start of a secret value.
  // Leading lookbehind (not \b) so env-style names like COMPOSIO_API_KEY still
  // match: underscore is a word char, so \b can't fire between COMPOSIO_ and API.
  [
    new RegExp(String.raw`${QUOTED_SECRET_KEY_PREFIX}"(?:\\.|[^"\\\r\n])*"`, 'gi'),
    `$1$2$1$3"${REDACTED}"`,
  ],
  [
    new RegExp(String.raw`${QUOTED_SECRET_KEY_PREFIX}'(?:\\.|[^'\\\r\n])*'`, 'gi'),
    `$1$2$1$3'${REDACTED}'`,
  ],
];

const isWordCharacter = (character: string): boolean => /[\p{L}\p{N}_]/u.test(character);

const activeQuotesAt = (
  input: string,
  offsets: ReadonlySet<number>
): ReadonlyMap<number, '"' | "'" | undefined> => {
  const activeQuotes = new Map<number, '"' | "'" | undefined>();
  let quote: '"' | "'" | undefined;
  let escaped = false;
  let lastOffset = -1;
  for (const offset of offsets) lastOffset = Math.max(lastOffset, offset);

  for (let position = 0; position < input.length; position += 1) {
    const character = input[position];
    if (offsets.has(position)) {
      activeQuotes.set(position, quote);
      if (position === lastOffset) break;
    }
    if (character === '\n' || character === '\r') {
      quote = undefined;
      escaped = false;
      continue;
    }
    const previous =
      position > 0 && !['\n', '\r'].includes(input[position - 1]) ? input[position - 1] : '';
    const following = input[position + 1] ?? '';
    if (!quote) {
      if (character === '"' || (character === "'" && !isWordCharacter(previous))) {
        quote = character;
      }
      continue;
    }
    if (escaped) escaped = false;
    else if (character === '\\') escaped = true;
    else if (character === quote) {
      if (quote === "'" && isWordCharacter(previous) && isWordCharacter(following)) continue;
      quote = undefined;
    }
  }

  return activeQuotes;
};

const completesQuotedFieldAt = (input: string, index: number, quote: '"' | "'"): boolean => {
  let escaped = false;
  for (let position = index; position < input.length; position += 1) {
    const character = input[position];
    if (character === '\n' || character === '\r') return false;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character !== quote) continue;

    let separator = position + 1;
    while (separator < input.length && /\s/.test(input[separator])) separator += 1;
    return input[separator] === ':' || input[separator] === '=';
  }
  return false;
};

const redactBareQuotedValue = (input: string, pattern: RegExp, quote: '"' | "'"): string => {
  pattern.lastIndex = 0;
  const matches = Array.from(input.matchAll(pattern));
  if (matches.length === 0) return input;

  const activeQuotes = activeQuotesAt(input, new Set(matches.map(match => match.index)));
  const parts: string[] = [];
  let cursor = 0;

  for (const match of matches) {
    const offset = match.index;
    parts.push(input.slice(cursor, offset));
    if (
      activeQuotes.get(offset) === quote &&
      (completesQuotedFieldAt(input, offset + match[0].length, quote) ||
        CONTAINS_QUOTED_FIELD.test(match[3]))
    ) {
      parts.push(match[0]);
    } else {
      parts.push(`${match[1]}${match[2]}${quote}${REDACTED}${quote}`);
    }
    cursor = offset + match[0].length;
  }

  parts.push(input.slice(cursor));
  return parts.join('');
};

/**
 * Redact common secret shapes from a free-form string. Returns the input
 * unchanged when it is empty or `undefined`.
 */
export const redactSensitiveText = (input: string | undefined): string | undefined => {
  if (!input) return input;
  let output = input;
  for (const [pattern, replacement] of REDACTION_RULES) {
    output = output.replace(pattern, replacement);
  }
  output = output.replace(BARE_KEY_ESCAPED_DOUBLE_QUOTED_VALUE, `$1$2\\"${REDACTED}\\"`);
  output = output.replace(BARE_KEY_ESCAPED_SINGLE_QUOTED_VALUE, `$1$2\\'${REDACTED}\\'`);
  output = redactBareQuotedValue(output, BARE_KEY_DOUBLE_QUOTED_VALUE, '"');
  output = redactBareQuotedValue(output, BARE_KEY_SINGLE_QUOTED_VALUE, "'");
  return output.replace(SECRET_PAIR_UNQUOTED, `$1$2${REDACTED}`);
};
