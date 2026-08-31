import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '../../src/utils/logger';

describe('Logger credential redaction', () => {
  afterEach(() => vi.restoreAllMocks());

  it('redacts secret-shaped fields at the output boundary', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const logger = new Logger({ level: 'debug', includeTimestamp: false });

    logger.debug('credentials', {
      apiKey: 'uak_test_secret',
      nested: { access_token: 'oauth_test_secret' },
      safe: 'visible',
    });

    const output = String(debug.mock.calls[0]?.[0]);
    expect(output).not.toContain('uak_test_secret');
    expect(output).not.toContain('oauth_test_secret');
    expect(output).toContain('[REDACTED]');
    expect(output).toContain('visible');
  });
});
