const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'access_token',
  'api_key',
  'apikey',
  'authorization',
  'client_secret',
  'composio_agent_key',
  'password',
  'refresh_token',
  'secret',
  'token',
  'user_api_key',
]);

const normalizeKey = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();

const redactStructuredValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactStructuredValue);
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      SENSITIVE_KEYS.has(normalizeKey(key)) ? REDACTED : redactStructuredValue(nested),
    ])
  );
};

/** Redact credential-shaped fields from structured values before logging. */
export const redactSensitiveLogValue = (value: unknown): unknown => {
  return redactStructuredValue(value);
};
