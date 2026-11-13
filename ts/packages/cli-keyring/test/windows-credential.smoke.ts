/**
 * Roundtrip check of the Windows Credential Manager store against the real
 * credential store. It needs `bun:ffi` and Windows, so it is a plain script
 * rather than a vitest suite:
 *
 *     bun test/windows-credential.smoke.ts
 *
 * The native Windows CI job runs it with the compiled CLI as the Bun runtime.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Entry } from '../src/core/entry';
import { KeyringError } from '../src/core/errors';
import { createDefaultStore, setDefaultStore } from '../src/index';

const store = await createDefaultStore();
assert.equal(store.id, 'windows-credential-ffi');
setDefaultStore(store);

const isNoEntry = (error: unknown) => error instanceof KeyringError && error.kind === 'NoEntry';
const entry = new Entry(`com.composio.cli.test.${randomUUID()}`, 'default');

await assert.rejects(entry.getPassword(), isNoEntry, 'a missing credential reads as NoEntry');

await entry.setPassword('first');
await entry.setPassword('second: ünïcödé ✓');
assert.equal(await entry.getPassword(), 'second: ünïcödé ✓', 'the last write wins');

const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
await entry.setSecret(bytes);
assert.deepEqual(Array.from(await entry.getSecret()), Array.from(bytes), 'binary roundtrip');

await assert.rejects(
  entry.setSecret(new Uint8Array(4096)),
  (error: unknown) => error instanceof KeyringError && error.kind === 'TooLong',
  'an oversized secret is rejected'
);

await entry.deleteCredential();
await assert.rejects(entry.getPassword(), isNoEntry, 'a deleted credential reads as NoEntry');
await assert.rejects(entry.deleteCredential(), isNoEntry, 'deleting twice reports NoEntry');

console.log('Windows Credential Manager roundtrip passed.');
