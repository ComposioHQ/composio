import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '../../src/utils/logger';

describe('Logger credential redaction', () => {
  afterEach(() => vi.restoreAllMocks());

  it('redacts secret-shaped fields at the output boundary', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const logger = new Logger({ level: 'debug', includeTimestamp: false });

    logger.debug('credentials', {
      apiKey: 'uak_test_secret',
      auth: 'app_key:pusher_signature',
      password: 'correct horse battery staple',
      nested: { access_token: 'oauth_test_secret' },
      safe: 'visible',
    });

    const output = String(debug.mock.calls[0]?.[0]);
    expect(output).not.toContain('uak_test_secret');
    expect(output).not.toContain('pusher_signature');
    expect(output).not.toContain('correct horse battery staple');
    expect(output).not.toContain('oauth_test_secret');
    expect(output).toContain('[REDACTED]');
    expect(output).toContain('visible');
  });
});

describe('Logger sink and configure', () => {
  afterEach(() => vi.restoreAllMocks());

  const createSink = () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  });

  it('writes formatted, redacted output to a custom sink instead of console', () => {
    const sink = createSink();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logger = new Logger({ level: 'warn', includeTimestamp: false, sink });

    logger.warn('token', { apiKey: 'uak_test_secret' });

    expect(consoleWarn).not.toHaveBeenCalled();
    expect(sink.warn).toHaveBeenCalledTimes(1);
    const output = String(sink.warn.mock.calls[0]?.[0]);
    expect(output).not.toContain('uak_test_secret');
    expect(output).toContain('[REDACTED]');
  });

  it('configure updates the level in place', () => {
    const sink = createSink();
    const logger = new Logger({ level: 'error', includeTimestamp: false, sink });

    logger.warn('dropped');
    expect(sink.warn).not.toHaveBeenCalled();

    logger.configure({ level: 'warn' });
    expect(logger.getLevel()).toBe('warn');
    logger.warn('emitted');
    expect(sink.warn).toHaveBeenCalledWith('emitted');
  });

  it('configure swaps the sink and keeps the level when level is omitted', () => {
    const first = createSink();
    const second = createSink();
    const logger = new Logger({ level: 'debug', includeTimestamp: false, sink: first });

    logger.configure({ sink: second });
    logger.debug('hello');

    expect(logger.getLevel()).toBe('debug');
    expect(first.debug).not.toHaveBeenCalled();
    expect(second.debug).toHaveBeenCalledWith('hello');
  });

  it("'silent' suppresses every level", () => {
    const sink = createSink();
    const logger = new Logger({ level: 'debug', includeTimestamp: false, sink });

    logger.configure({ level: 'silent' });
    logger.error('e');
    logger.warn('w');
    logger.info('i');
    logger.debug('d');

    expect(sink.error).not.toHaveBeenCalled();
    expect(sink.warn).not.toHaveBeenCalled();
    expect(sink.info).not.toHaveBeenCalled();
    expect(sink.debug).not.toHaveBeenCalled();
  });
});
