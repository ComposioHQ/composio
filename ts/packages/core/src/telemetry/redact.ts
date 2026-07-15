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

const REDACTION_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // URL query strings — tokens, presigned signatures, one-time codes.
  [/(\bhttps?:\/\/[^\s?#'"]+)\?[^\s'"]*/gi, `$1?${REDACTED}`],
  // Authorization scheme + credential: `Bearer <token>`, `Basic <token>`.
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`],
  // Secret-ish `key: value` / `key=value` / `key: "value"` / `key: 'value'` pairs.
  [
    /\b(authorization|api[-_]?key|apikey|x-api-key|access[-_]?token|refresh[-_]?token|client[-_]?secret|secret|password|passwd|pwd)\b(\s*[:=]+\s*)(["']?)([^\s"',}&]+)\3/gi,
    `$1$2$3${REDACTED}$3`,
  ],
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
