import { Effect } from 'effect';
import { HOST_CONFIG } from 'src/effects/app-config';
import { loadHostConfig } from 'src/services/config';

const ciRedactionEnabled = loadHostConfig(HOST_CONFIG.CI_REDACTION_ENABLED);

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
  if (!Effect.runSync(ciRedactionEnabled)) return value as `${Prefix}${string}`;
  return `${prefix ?? ''}<REDACTED>` as `${Prefix}${string}`;
}
