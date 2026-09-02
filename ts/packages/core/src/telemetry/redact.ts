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
const SECRET_PAIR_PREFIX = String.raw`(?<![A-Za-z0-9])(${SECRET_KEY_PATTERN})\b(["']?\s*[:=]+\s*)`;

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
  [
    new RegExp(
      String.raw`${BARE_SECRET_KEY_PREFIX}"(?!\s*(?:,|}|\]|\)|$))(?:\\.|[^"\\\r\n])*"`,
      'gi'
    ),
    `$1$2"${REDACTED}"`,
  ],
  [
    new RegExp(
      String.raw`${BARE_SECRET_KEY_PREFIX}'(?!\s*(?:,|}|\]|\)|$))(?:\\.|[^'\\\r\n])*'`,
      'gi'
    ),
    `$1$2'${REDACTED}'`,
  ],
  [new RegExp(String.raw`${SECRET_PAIR_PREFIX}([^\s"',}&]+)`, 'gi'), `$1$2${REDACTED}`],
];

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
  return output;
};
