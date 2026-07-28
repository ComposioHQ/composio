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
