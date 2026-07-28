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

  it('leaves benign error text untouched', () => {
    const benign = 'TypeError: cannot read property foo of undefined at Object.<anonymous>';
    expect(redactSensitiveText(benign)).toBe(benign);
  });
});
