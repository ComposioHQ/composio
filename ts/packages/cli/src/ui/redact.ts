import { Effect } from 'effect';
import { UNPREFIXED_CONFIG } from 'src/effects/app-config';
import { loadHostConfig } from 'src/services/config';

// Read once at import time, like `ui/colors.ts`: `redact` runs per formatted
// value, and spinning up a fiber per call to read a single environment
// variable is pure overhead.
const ciRedactionEnabled = Effect.runSync(loadHostConfig(UNPREFIXED_CONFIG.CI_REDACTION_ENABLED));

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
  if (!ciRedactionEnabled) return value as `${Prefix}${string}`;
  return `${prefix ?? ''}<REDACTED>` as `${Prefix}${string}`;
}
