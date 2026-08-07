import { describe, it, expect } from 'vitest';
import { redactSensitiveText } from '../../src/telemetry/redact';

describe('redactSensitiveText', () => {
  it('returns empty/undefined input unchanged', () => {
    expect(redactSensitiveText(undefined)).toBeUndefined();
    expect(redactSensitiveText('')).toBe('');
  });

  it('redacts URL query strings while keeping the path', () => {
    const out = redactSensitiveText(
      'Failed to PUT https://s3.amazonaws.com/bucket/key?X-Amz-Signature=deadbeef&token=abc'
    );
    expect(out).toContain('https://s3.amazonaws.com/bucket/key?[REDACTED]');
    expect(out).not.toContain('deadbeef');
    expect(out).not.toContain('token=abc');
  });

  it('redacts Authorization bearer/basic credentials', () => {
    const auth = redactSensitiveText('Authorization: Bearer sk-live-1234567890')!;
    expect(auth).toContain('[REDACTED]');
    expect(auth).not.toContain('sk-live-1234567890');
    expect(redactSensitiveText('used Basic dXNlcjpwYXNz here')).toBe('used Basic [REDACTED] here');
  });

  it('redacts secret-like key/value pairs', () => {
    for (const sample of [
      'api_key=ck_abcdef123456',
      'x-api-key: "ck_secretvalue"',
      "client_secret: 'topsecret'",
      'password=hunter2',
      'access_token=ya29.a0Afoobar',
    ]) {
      const out = redactSensitiveText(sample)!;
      expect(out, sample).toContain('[REDACTED]');
      expect(out, sample).not.toMatch(/ck_abcdef123456|ck_secretvalue|topsecret|hunter2|ya29/);
    }
  });

  it('preserves quotes around redacted values', () => {
    expect(redactSensitiveText('x-api-key: "ck_secretvalue"')).toContain('"[REDACTED]"');
  });

  // Serialized payloads are the common shape in error text: the key's own
  // closing quote sits between the name and the colon, so a pattern anchored on
  // `name` followed directly by `:` never matches.
  it('redacts secrets inside JSON payloads', () => {
    for (const [sample, secret] of [
      ['{"api_key": "ck_live_abc123"}', 'ck_live_abc123'],
      ['{"api_key":"ck_live_abc123"}', 'ck_live_abc123'],
      ['{"api_key" : "ck_live_abc123"}', 'ck_live_abc123'],
      ['{"refresh_token":"rt-abc.def-123"}', 'rt-abc.def-123'],
      ['{"x-api-key":"ck_hdr","user":"bob"}', 'ck_hdr'],
      [`{'client_secret': 'cs_live_abc123'}`, 'cs_live_abc123'],
      ['{"password": "hunter2"}', 'hunter2'],
    ] as const) {
      const out = redactSensitiveText(sample)!;
      expect(out, sample).toContain('[REDACTED]');
      expect(out, sample).not.toContain(secret);
    }
  });

  it('redacts a secret in a serialized error payload while keeping context', () => {
    const out = redactSensitiveText(
      'Error executing tool: request body was rejected: ' +
        '{"toolkit": "GMAIL", "arguments": {"api_key": "ck_live_CUSTOMER", "to": "x@y.z"}}'
    )!;
    expect(out).not.toContain('ck_live_CUSTOMER');
    expect(out).toContain('GMAIL');
  });

  it('preserves JSON keys and quoting, replacing only the value', () => {
    expect(redactSensitiveText('{"api_key": "ck_live_abc123"}')).toBe('{"api_key": "[REDACTED]"}');
  });

  it('leaves a key name with no attached value untouched', () => {
    for (const benign of [
      'the password field is required',
      'no separator here "api_key" and nothing else',
    ]) {
      expect(redactSensitiveText(benign), benign).toBe(benign);
    }
  });

  it('leaves benign error text untouched', () => {
    const benign = 'TypeError: cannot read property foo of undefined at Object.<anonymous>';
    expect(redactSensitiveText(benign)).toBe(benign);
  });

  // Underscore before api_key is a word char, so a leading \b would miss these.
  it('redacts env-style prefixed API keys', () => {
    for (const [sample, secret] of [
      ['COMPOSIO_API_KEY=sk_live_9f3c', 'sk_live_9f3c'],
      ['OPENAI_API_KEY=sk_live_9f3c', 'sk_live_9f3c'],
      ['export COMPOSIO_API_KEY="sk_live_9f3c"', 'sk_live_9f3c'],
    ] as const) {
      const out = redactSensitiveText(sample)!;
      expect(out, sample).toContain('[REDACTED]');
      expect(out, sample).not.toContain(secret);
    }
  });

  it('does not match a secret name embedded in letters', () => {
    expect(redactSensitiveText('myapikey=sk_live_9f3c')).toBe('myapikey=sk_live_9f3c');
  });
});
