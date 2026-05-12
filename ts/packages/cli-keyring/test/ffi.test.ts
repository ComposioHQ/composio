/**
 * FFI-backend roundtrip test — exercises the real `bun:ffi`
 * `SecItem*` path against the live macOS keychain.
 *
 * Gated twice: the test only runs when
 *
 *   - we are in Bun (`globalThis.Bun !== undefined`), AND
 *   - `COMPOSIO_KEYRING_E2E=1` is set in the env.
 *
 * The first gate keeps the file inert when vitest runs under Node
 * (where importing `bun:ffi` would crash at module load). The second
 * keeps CI and the default `pnpm test` run from touching the user's
 * real keychain.
 *
 * Run locally with:
 *
 *     COMPOSIO_KEYRING_E2E=1 bun --bun x vitest run test/ffi.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Entry } from '../src/core/entry';
import { KeyringError } from '../src/core/errors';
import { setDefaultStore, unsetDefaultStore } from '../src/core/store';
import type { CredentialStore } from '../src/core/store';

const underBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';
const enabled = underBun && process.env.COMPOSIO_KEYRING_E2E === '1';
const suite = enabled ? describe : describe.skip;

suite('ffi: MacOSSecurityFFIStore roundtrip', () => {
  let store: CredentialStore;

  beforeAll(async () => {
    // Import dynamically — never touch this module from Node.
    const mod = await import('../src/stores/macos-security-ffi');
    store = new mod.MacOSSecurityFFIStore();
    setDefaultStore(store);
  });

  afterAll(() => {
    unsetDefaultStore();
  });

  it('reports the expected id and vendor', () => {
    expect(store.id).toBe('macos-security-ffi');
    expect(store.vendor).toContain('bun:ffi');
  });

  it('roundtrips a password', async () => {
    const entry = new Entry(`com.composio.cli.ffi.${randomUUID()}`, 'default');
    try {
      const password = `ffi-${randomUUID()}`;
      await entry.setPassword(password);
      expect(await entry.getPassword()).toBe(password);
    } finally {
      try {
        await entry.deleteCredential();
      } catch {
        /* best-effort cleanup */
      }
    }
  });

  it('overwrites on repeated setPassword without duplicate error', async () => {
    const entry = new Entry(`com.composio.cli.ffi.${randomUUID()}`, 'default');
    try {
      await entry.setPassword('first');
      await entry.setPassword('second');
      await entry.setPassword('third');
      expect(await entry.getPassword()).toBe('third');
    } finally {
      try {
        await entry.deleteCredential();
      } catch {
        /* best-effort cleanup */
      }
    }
  });

  it('throws NoEntry for a missing credential', async () => {
    const entry = new Entry(`com.composio.cli.ffi.nonexistent.${randomUUID()}`, 'default');
    await expect(entry.getPassword()).rejects.toSatisfy(
      (err: unknown) => err instanceof KeyringError && err.kind === 'NoEntry'
    );
  });

  it('roundtrips arbitrary binary bytes', async () => {
    const entry = new Entry(`com.composio.cli.ffi.bin.${randomUUID()}`, 'default');
    try {
      const bytes = new Uint8Array(256);
      for (let i = 0; i < 256; i++) bytes[i] = i;
      await entry.setSecret(bytes);
      const got = await entry.getSecret();
      expect(Array.from(got)).toEqual(Array.from(bytes));
    } finally {
      try {
        await entry.deleteCredential();
      } catch {
        /* best-effort cleanup */
      }
    }
  });

  it('delete then read throws NoEntry', async () => {
    const entry = new Entry(`com.composio.cli.ffi.del.${randomUUID()}`, 'default');
    await entry.setPassword('x');
    await entry.deleteCredential();
    await expect(entry.getPassword()).rejects.toSatisfy(
      (err: unknown) => err instanceof KeyringError && err.kind === 'NoEntry'
    );
  });
});
