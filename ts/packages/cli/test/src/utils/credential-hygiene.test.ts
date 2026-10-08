import { describe, expect, it } from 'vitest';
import { redactSensitiveLogValue } from 'src/utils/redact-sensitive';

describe('credential hygiene', () => {
  it('redacts nested credential keys in structured values', () => {
    const value = {
      apiKey: 'uak_test_secret',
      nested: { user_api_key: 'agent_test_secret' },
      safe: 'visible',
    };

    const redactedObject = redactSensitiveLogValue(value);

    expect(JSON.stringify(redactedObject)).not.toContain('uak_test_secret');
    expect(JSON.stringify(redactedObject)).not.toContain('agent_test_secret');
    expect(JSON.stringify(redactedObject)).toContain('visible');
  });
});
