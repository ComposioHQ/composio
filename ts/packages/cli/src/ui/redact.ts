import process from 'node:process';

/**
 * Redact a value when running in CI (e.g., CLI recordings).
 * Preserves a recognized prefix (e.g., "ac_" -> "ac_<REDACTED>").
 * Returns the original value in non-CI environments.
 */
export function redact<const Prefix extends string = string>({
  value,
  prefix,
}: {
  value: string;
  prefix?: Prefix;
}): `${Prefix}${string}` {
  // eslint-disable-next-line eslint-js/no-restricted-syntax -- plain sync string helper called from formatting code; CI flag toggles redaction in recorded CLI output
  if (process.env.CI !== 'true') return value as `${Prefix}${string}`;
  return `${prefix ?? ''}<REDACTED>` as `${Prefix}${string}`;
}

/**
 * A `JSON.stringify` replacer that redacts identifier-bearing fields in CI.
 *
 * Every machine-readable document the CLI writes to stdout goes through this, so a recorded
 * `--json` payload carries no account identifiers. Outside CI it returns values untouched, which
 * is what keeps the contract intact for real callers.
 */
export const ciRedactReplacer = (key: string, value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  if (key === 'logId') return redact({ value, prefix: 'log_' });
  if (key === 'id' || key.endsWith('Id') || key.endsWith('_id')) {
    return redact({ value });
  }
  return value;
};
