import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Entry } from '../src/core/entry';
import { KeyringError } from '../src/core/errors';
import {
  type CredentialStore,
  setDefaultStore,
  unsetDefaultStore,
  hasDefaultStore,
  getDefaultStore,
} from '../src/core/store';
import { CredentialPersistence } from '../src/core/persistence';

/**
 * In-memory store used by every unit test. Lets us exercise Entry's
 * routing and validation logic without shelling out to a real keystore.
 */
class MemoryStore implements CredentialStore {
  readonly id = 'memory';
  readonly vendor = 'test in-memory';
  private readonly items = new Map<string, Uint8Array>();

  persistence() {
    return CredentialPersistence.ProcessOnly;
  }

  private key(service: string, user: string) {
    return `${service}\0${user}`;
  }

  async setSecret(service: string, user: string, secret: Uint8Array) {
    this.items.set(this.key(service, user), new Uint8Array(secret));
  }

  async getSecret(service: string, user: string) {
    const v = this.items.get(this.key(service, user));
    if (v === undefined) throw new KeyringError({ kind: 'NoEntry' });
    return v;
  }

  async deleteCredential(service: string, user: string) {
    if (!this.items.delete(this.key(service, user))) {
      throw new KeyringError({ kind: 'NoEntry' });
    }
  }
}

describe('Entry', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
    setDefaultStore(store);
  });

  afterEach(() => {
    unsetDefaultStore();
  });

  it('rejects empty service', () => {
    expect(() => new Entry('', 'user')).toThrowError(KeyringError);
    try {
      new Entry('', 'user');
    } catch (err) {
      expect(err).toBeInstanceOf(KeyringError);
      expect((err as KeyringError).kind).toBe('Invalid');
    }
  });

  it('rejects empty user', () => {
    expect(() => new Entry('svc', '')).toThrowError(KeyringError);
  });

  it('roundtrips a UTF-8 password', async () => {
    const entry = new Entry('com.composio.cli', 'default');
    await entry.setPassword('hunter2-😀');
    expect(await entry.getPassword()).toBe('hunter2-😀');
  });

  it('throws NoEntry when reading a missing credential', async () => {
    const entry = new Entry('com.composio.cli', 'nobody');
    await expect(entry.getPassword()).rejects.toSatisfy(
      (err: unknown) => err instanceof KeyringError && err.kind === 'NoEntry'
    );
  });

  it('throws BadEncoding when stored bytes are not valid UTF-8', async () => {
    const entry = new Entry('com.composio.cli', 'binaryuser');
    await entry.setSecret(new Uint8Array([0xff, 0xfe, 0xfd]));
    await expect(entry.getPassword()).rejects.toSatisfy(
      (err: unknown) => err instanceof KeyringError && err.kind === 'BadEncoding'
    );
  });

  it('roundtrips raw binary bytes', async () => {
    const entry = new Entry('com.composio.cli', 'binaryuser');
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 255]);
    await entry.setSecret(bytes);
    const got = await entry.getSecret();
    expect(Array.from(got)).toEqual(Array.from(bytes));
  });

  it('deleteCredential removes the entry and future reads throw NoEntry', async () => {
    const entry = new Entry('com.composio.cli', 'default');
    await entry.setPassword('secret');
    await entry.deleteCredential();
    await expect(entry.getPassword()).rejects.toSatisfy(
      (err: unknown) => err instanceof KeyringError && err.kind === 'NoEntry'
    );
  });

  it('overrides the default store via constructor argument', async () => {
    const other = new MemoryStore();
    const entry = new Entry('svc', 'user', {}, other);
    await entry.setPassword('x');
    // Default store should still be empty.
    await expect(new Entry('svc', 'user').getPassword()).rejects.toSatisfy(
      (err: unknown) => err instanceof KeyringError && err.kind === 'NoEntry'
    );
    expect(await entry.getPassword()).toBe('x');
  });

  it('throws NoDefaultStore when no store is registered', async () => {
    unsetDefaultStore();
    expect(hasDefaultStore()).toBe(false);
    expect(() => getDefaultStore()).toThrowError(KeyringError);
    const entry = new Entry('svc', 'user');
    await expect(entry.getPassword()).rejects.toSatisfy(
      (err: unknown) => err instanceof KeyringError && err.kind === 'NoDefaultStore'
    );
  });
});
