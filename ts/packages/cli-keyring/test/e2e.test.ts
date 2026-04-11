/**
 * Real-keystore roundtrip test.
 *
 * Gated behind `COMPOSIO_KEYRING_E2E=1` so CI and the default
 * `pnpm test` run don't touch the user's keychain. Run locally with:
 *
 *     COMPOSIO_KEYRING_E2E=1 pnpm --filter @composio/cli-keyring test
 *
 * Each test uses a UUID-suffixed service name so parallel runs (and
 * leftover entries from crashed runs) never collide with the user's
 * real credentials.
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Entry } from '../src/core/entry';
import { KeyringError } from '../src/core/errors';
import { createDefaultStore, setDefaultStore } from '../src/index';

const enabled = process.env.COMPOSIO_KEYRING_E2E === '1';
const suite = enabled ? describe : describe.skip;

suite('e2e: real OS keystore', () => {
  beforeAll(async () => {
    setDefaultStore(await createDefaultStore());
  });

  const service = `com.composio.cli.test.${randomUUID()}`;
  const user = 'default';
  const entry = new Entry(service, user);

  afterAll(async () => {
    try {
      await entry.deleteCredential();
    } catch (err) {
      if (!(err instanceof KeyringError) || err.kind !== 'NoEntry') {
        throw err;
      }
    }
  });

  it('roundtrips a password', async () => {
    const password = `test-${randomUUID()}`;
    await entry.setPassword(password);
    expect(await entry.getPassword()).toBe(password);
  });

  it('overwrites on repeated setPassword', async () => {
    await entry.setPassword('first');
    await entry.setPassword('second');
    expect(await entry.getPassword()).toBe('second');
  });

  it('delete then get throws NoEntry', async () => {
    await entry.setPassword('x');
    await entry.deleteCredential();
    await expect(entry.getPassword()).rejects.toSatisfy(
      (err: unknown) => err instanceof KeyringError && err.kind === 'NoEntry'
    );
  });

  it('roundtrips binary bytes', async () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 255, 254, 253]);
    await entry.setSecret(bytes);
    expect(Array.from(await entry.getSecret())).toEqual(Array.from(bytes));
  });
});
