/**
 * Backend selection contract. Runs everywhere and touches no
 * credential store — it only inspects which store object is built.
 *
 * The macOS FFI backend prompts for trust on binaries that are not
 * signed with a stable Developer ID, so it must never be selected
 * implicitly. Only an explicit `'ffi'` request may reach it.
 */

import { describe, it, expect } from 'vitest';
import { createDefaultStore, createDefaultStoreSync, createMacOSStore } from '../src/index';

const onMacOS = process.platform === 'darwin';
const macOS = onMacOS ? describe : describe.skip;

macOS('macOS backend selection', () => {
  it('never picks the FFI backend implicitly', async () => {
    for (const store of [
      await createMacOSStore(),
      await createMacOSStore('auto'),
      await createMacOSStore('subprocess'),
      await createDefaultStore(),
      await createDefaultStore({ macOSBackend: 'auto' }),
      createDefaultStoreSync(),
    ]) {
      expect(store.id).toBe('macos-security-subprocess');
    }
  });
});

describe('default store', () => {
  it('builds a store for the current platform', async () => {
    const expectedId = {
      darwin: 'macos-security-subprocess',
      linux: 'linux-secret-tool',
    }[process.platform as 'darwin' | 'linux'];

    const store = await createDefaultStore();
    expect(store.id).toBe(expectedId ?? 'unsupported');
  });
});
