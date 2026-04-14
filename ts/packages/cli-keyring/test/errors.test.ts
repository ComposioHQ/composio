import { describe, it, expect } from 'vitest';
import { KeyringError } from '../src/core/errors';

describe('KeyringError', () => {
  it('exposes kind via getter and .is() predicate', () => {
    const err = new KeyringError({ kind: 'NoEntry' });
    expect(err.kind).toBe('NoEntry');
    expect(err.is('NoEntry')).toBe(true);
    expect(err.is('PlatformFailure')).toBe(false);
  });

  it('preserves the underlying cause chain for PlatformFailure', () => {
    const inner = new Error('boom');
    const err = new KeyringError({ kind: 'PlatformFailure', cause: inner });
    expect((err as { cause?: unknown }).cause).toBe(inner);
    expect(err.message).toContain('boom');
  });

  it('formats a readable message for every variant', () => {
    const cases: KeyringError[] = [
      new KeyringError({ kind: 'NoEntry' }),
      new KeyringError({ kind: 'NoDefaultStore' }),
      new KeyringError({ kind: 'PlatformFailure', cause: new Error('x') }),
      new KeyringError({ kind: 'NoStorageAccess', cause: 'locked' }),
      new KeyringError({ kind: 'BadEncoding', bytes: new Uint8Array([0xff, 0xfe]) }),
      new KeyringError({
        kind: 'BadDataFormat',
        bytes: new Uint8Array(),
        cause: new Error('nope'),
      }),
      new KeyringError({ kind: 'BadStoreFormat', detail: 'corrupt' }),
      new KeyringError({ kind: 'TooLong', attr: 'service', limit: 1024 }),
      new KeyringError({ kind: 'Invalid', param: 'user', reason: 'empty' }),
      new KeyringError({ kind: 'Ambiguous', matches: [] }),
      new KeyringError({ kind: 'NotSupportedByStore', operation: 'updateAttributes' }),
    ];
    for (const err of cases) {
      expect(err.message.length).toBeGreaterThan(0);
      expect(err.name).toBe('KeyringError');
    }
  });
});
